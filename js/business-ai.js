/* ==========================================================================
   BUSINESS AI — in-site assistant powered by Google Gemini (see ai-config.js)
   - Answers business / shopping questions without the visitor leaving the site
   - Can look at a product's picture (or a photo the shopper attaches)
   - Remembers each shopper's conversation (per account, on this device)
   ========================================================================== */
(function () {
  const CFG = (typeof BUSINESS_AI_CONFIG !== "undefined") ? BUSINESS_AI_CONFIG : { enabled: false };
  const MAX_STORED = 60;      // messages kept in memory per shopper
  const CONTEXT_TURNS = 14;   // recent messages sent to Gemini each time
  let pendingImage = null;    // { mime, data(base64), label }
  let busy = false;

  /* ---------- memory ---------- */
  function memoryKey() {
    const s = FMG.getSession();
    if (s && s.id) return "fmg_ai_chat_" + s.type + "_" + s.id;
    let g = localStorage.getItem("fmg_ai_guest_id");
    if (!g) { g = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); localStorage.setItem("fmg_ai_guest_id", g); }
    return "fmg_ai_chat_guest_" + g;
  }
  function loadHistory() { try { return JSON.parse(localStorage.getItem(memoryKey())) || []; } catch (e) { return []; } }
  function saveHistory(h) { try { localStorage.setItem(memoryKey(), JSON.stringify(h.slice(-MAX_STORED))); } catch (e) {} }

  /* ---------- UI helpers ---------- */
  const $ = id => document.getElementById(id);
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function fmt(text) {   // safe mini-markdown: escape first, then **bold**, `-` bullets, line breaks
    return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^\s*[-*]\s+/gm, "• ").replace(/\n/g, "<br>");
  }
  function addBubble(role, text, opts) {
    const body = $("baiBody");
    const d = document.createElement("div");
    d.className = "bai-msg " + role;
    d.innerHTML = fmt(text);
    if (opts && opts.imageSrc) { const im = document.createElement("img"); im.src = opts.imageSrc; d.prepend(im); }
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }
  function renderHistory() {
    const body = $("baiBody");
    body.innerHTML = "";
    const h = loadHistory();
    if (!h.length) {
      addBubble("bot", "Hello, I'm the **Business AI**. Ask me about products, prices, which seller to choose, delivery, payments, or how to grow a small business. You can also attach a photo and I'll tell you what I see.");
    } else {
      h.forEach(m => { const b = addBubble(m.role === "user" ? "user" : "bot", m.text, m.hadImage ? {} : undefined); if (m.by) { const t = document.createElement("div"); t.className = "bai-by"; t.textContent = "via " + m.by; b.appendChild(t); } });
    }
    $("baiClearBtn").style.display = h.length ? "" : "none";
  }

  /* ---------- marketplace knowledge sent as context ---------- */
  function catalogueContext() {
    const biz = FMG.getBusinesses();
    const products = FMG.getProducts().slice(0, 60).map(p => {
      const b = biz.find(x => x.id === p.bizId);
      const price = p.discount ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
      return `- ${p.name} | ${FMG.categoryById(p.category)?.label || p.category} | UGX ${price}` +
        (p.discount ? ` (${p.discount}% off)` : "") + ` | seller: ${b ? b.name : "unknown"}` +
        (b ? ` (${FMG.locationById(b.location)?.label || ""})` : "") + (p.description ? ` | ${String(p.description).slice(0, 120)}` : "");
    }).join("\n");
    return products || "(no products listed yet)";
  }
  function systemPrompt() {
    return [
      "You are Business AI, the built-in assistant of CAMPUS MARKET, an online marketplace built by Group A, Kampala University Masaka, serving shoppers and small businesses in Uganda (prices in UGX).",
      "Scope: ONLY business and shopping topics: products, comparing quality and value, pricing, choosing sellers, delivery and pickup, payments, running or growing a small business, marketing, stock, and customer service. Politely decline unrelated requests and steer back to business.",
      "Style: professional, warm, concise (usually under 150 words). Use short bullet points for comparisons. Never invent products or prices: for items sold on CAMPUS MARKET use ONLY the catalogue below; for general market knowledge say it is general guidance.",
      "Platform facts: payment methods are MTN MoMo, Airtel Pay and Mastercard and the checkout only offers methods every seller in the cart accepts; delivery fee per product never exceeds UGX 10,000; shoppers can use 'Message seller' on a product page; registering a business is free for the first 100 sign-ups for 6 months.",
      "If asked to look at an image, describe what is visible and relate it to buying, quality, or selling advice. Do not claim certainty about authenticity or exact condition from a photo.",
      "CURRENT CATALOGUE:\n" + catalogueContext()
    ].join("\n\n");
  }

  /* ---------- provider router (many free AI services, automatic fallback) ---------- */
  function isActive(p) {
    if (CFG.proxyUrl && p.viaProxy) return true;
    return !!(p.apiKey && String(p.apiKey).trim());
  }
  function activeProviders() { return (CFG.providers || []).filter(isActive); }
  function aiReady() { return CFG.enabled && activeProviders().length > 0; }
  let rr = 0;   // rotates the first choice in "spread" mode

  async function fetchJSON(url, headers, body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), CFG.timeoutMs || 20000);
    try {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) { const tx = await r.text().catch(() => ""); const e = new Error("HTTP " + r.status + " " + tx.slice(0, 160)); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(t); }
  }
  // sends either straight to the provider, or via your own proxy server (keys stay private there)
  function send_(p, url, headers, body) {
    if (CFG.proxyUrl && p.viaProxy) return fetchJSON(CFG.proxyUrl, { "Content-Type": "application/json" }, { provider: p.id, model: p.model, payload: body });
    return fetchJSON(url, headers, body);
  }

  async function askGemini(p, history, imagePart) {
    const recent = history.slice(-CONTEXT_TURNS);
    const contents = recent.map((m, i) => {
      const parts = [{ text: m.text }];
      if (i === recent.length - 1 && imagePart) parts.push({ inline_data: { mime_type: imagePart.mime, data: imagePart.data } });
      return { role: m.role === "user" ? "user" : "model", parts };
    });
    const body = { system_instruction: { parts: [{ text: systemPrompt() }] }, contents, generationConfig: { temperature: 0.5, maxOutputTokens: 700 } };
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(p.model) + ":generateContent";
    const headers = { "Content-Type": "application/json", "x-goog-api-key": p.apiKey || "" };
    let data;
    if (p.search) {
      try { data = await send_(p, url, headers, Object.assign({}, body, { tools: [{ google_search: {} }] })); }
      catch (e) { if (e.status === 400) data = await send_(p, url, headers, body); else throw e; }
    } else data = await send_(p, url, headers, body);
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    return parts ? parts.map(x => x.text || "").join("").trim() : "";
  }

  async function askOpenAICompatible(p, history, imagePart) {
    const recent = history.slice(-CONTEXT_TURNS);
    const msgs = [{ role: "system", content: systemPrompt() }].concat(recent.map((m, i) => {
      const role = m.role === "user" ? "user" : "assistant";
      if (i === recent.length - 1 && imagePart && p.vision) {
        return { role, content: [{ type: "text", text: m.text }, { type: "image_url", image_url: { url: "data:" + imagePart.mime + ";base64," + imagePart.data } }] };
      }
      return { role, content: m.text };
    }));
    const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + (p.apiKey || "") };
    if (p.id === "openrouter") { headers["HTTP-Referer"] = location.origin; headers["X-Title"] = "CAMPUS MARKET"; }
    const data = await send_(p, p.url, headers, { model: p.model, messages: msgs, temperature: 0.5, max_tokens: 700 });
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return (typeof c === "string" ? c : "").trim();
  }

  // Tries providers in turn. preferred = a provider id chosen by the shopper, or "auto".
  async function askAI(history, imagePart, preferred) {
    let list = activeProviders();
    if (preferred && preferred !== "auto") {
      const first = list.filter(p => p.id === preferred);
      list = first.concat(list.filter(p => p.id !== preferred));     // chosen one first, others as backup
    } else if (CFG.mode === "spread" && list.length > 1) {
      const k = rr++ % list.length; list = list.slice(k).concat(list.slice(0, k));
    }
    if (imagePart) {                                                  // picture questions need a provider that can see
      const seers = list.filter(p => p.vision); if (seers.length) list = seers;
    }
    const failures = [];
    for (const p of list) {
      try {
        const text = p.type === "gemini" ? await askGemini(p, history, imagePart) : await askOpenAICompatible(p, history, imagePart);
        if (text) return { text, by: p.name, id: p.id };
        failures.push(p.name + ": empty answer");
      } catch (e) { failures.push(p.name + ": " + e.message); }
    }
    const err = new Error("All providers failed"); err.failures = failures; throw err;
  }

  /* ---------- send flow ---------- */
  async function send(textOverride) {
    if (busy) return;
    const input = $("baiInput");
    const text = (textOverride || input.value).trim();
    if (!text && !pendingImage) return;
    const question = text || "What can you tell me about this picture?";
    input.value = "";
    const img = pendingImage; pendingImage = null; renderAttachChip();
    const history = loadHistory();
    history.push({ role: "user", text: question, at: Date.now(), hadImage: !!img });
    saveHistory(history);
    addBubble("user", question, img ? { imageSrc: "data:" + img.mime + ";base64," + img.data } : undefined);
    $("baiClearBtn").style.display = "";
    busy = true; $("baiSend").disabled = true;
    const typing = addBubble("bot", "Researching…"); typing.classList.add("typing");
    let answer, fellBack = false, by = "";
    try {
      if (!aiReady()) throw new Error("not-configured");
      const res = await askAI(history, img, $("baiProvider") ? $("baiProvider").value : "auto"); answer = res.text; by = res.by;
    } catch (err) {
      if (err.message !== "not-configured") console.warn("Business AI fell back to built-in answers:", err.failures || err);
      fellBack = true;
      answer = (typeof botReply === "function") ? botReply(question) : "Sorry, I can't reach the research service right now. Please try again shortly.";
      if (img) answer = "I can't analyse pictures right now, but " + answer.charAt(0).toLowerCase() + answer.slice(1);
    }
    typing.remove();
    const bub = addBubble("bot", answer);
    if (by) { const tag = document.createElement("div"); tag.className = "bai-by"; tag.textContent = "via " + by; bub.appendChild(tag); }
    history.push({ role: "bot", text: answer, by: by, at: Date.now(), offline: fellBack });
    saveHistory(history);
    busy = false; $("baiSend").disabled = false; input.focus();
  }

  /* ---------- image attach (shopper photo or product photo) ---------- */
  function renderAttachChip() {
    const c = $("baiAttach");
    if (!pendingImage) { c.classList.add("hidden"); c.innerHTML = ""; return; }
    c.classList.remove("hidden");
    c.innerHTML = '<img src="data:' + pendingImage.mime + ';base64,' + pendingImage.data + '" alt=""><span>' + esc(pendingImage.label) + '</span><button type="button" aria-label="Remove image">&times;</button>';
    c.querySelector("button").onclick = () => { pendingImage = null; renderAttachChip(); };
  }
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const im = new Image();
        im.onerror = reject;
        im.onload = () => {
          const s = Math.min(1, 900 / Math.max(im.width, im.height));
          const c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          resolve({ mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.8).split(",")[1], label: file.name || "photo" });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- public: ask about a product (button on product page) ---------- */
  window.askBusinessAIAboutProduct = function (productId) {
    const p = FMG.getProducts().find(x => x.id === productId);
    if (!p) return;
    const ov = document.getElementById("productOverlay"); if (ov) ov.remove();
    openPanel();
    const b = FMG.businessById(p.bizId);
    if (typeof p.image === "string" && p.image.indexOf("data:image") === 0) {
      pendingImage = { mime: p.image.slice(5, p.image.indexOf(";")), data: p.image.split(",")[1], label: p.name };
      renderAttachChip();
    }
    send("Tell me about \"" + p.name + "\" from " + (b ? b.name : "this seller") + ": what does the picture show, is the price fair, and what should I check before buying?");
  };

  function fillProviders() {
    const sel = $("baiProvider"); if (!sel) return;
    const keep = sel.value || "auto";
    sel.innerHTML = '<option value="auto">Auto (best available)</option>' + activeProviders().map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join("");
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : "auto";
    sel.parentElement.style.display = activeProviders().length > 1 ? "" : "none";
  }
  function openPanel() { fillProviders(); $("baiPanel").classList.remove("hidden"); $("baiToggle").classList.add("hidden"); renderHistory(); }
  function closePanel() { $("baiPanel").classList.add("hidden"); $("baiToggle").classList.remove("hidden"); }

  document.addEventListener("DOMContentLoaded", () => {
    if (!$("baiPanel")) return;
    $("baiToggle").onclick = openPanel;
    $("baiCloseBtn").onclick = closePanel;
    $("baiSend").onclick = () => send();
    $("baiInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    $("baiPhotoBtn").onclick = () => $("baiFile").click();
    $("baiFile").onchange = async e => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f || !/^image\//.test(f.type)) return;
      try { pendingImage = await fileToImage(f); renderAttachChip(); } catch (_) { FMG && typeof showToast === "function" && showToast("Couldn't read that image."); }
    };
    $("baiClearBtn").onclick = () => { if (confirm("Delete your chat history with Business AI on this device?")) { localStorage.removeItem(memoryKey()); renderHistory(); } };
    document.querySelectorAll(".bai-quick button").forEach(b => b.onclick = () => send(b.textContent));
    // switching account (login/logout) loads that person's own conversation
    window.addEventListener("storage", e => { if (e.key === "fmg_session" && !$("baiPanel").classList.contains("hidden")) renderHistory(); });
  });
  window.businessAIRefresh = function () { if ($("baiPanel") && !$("baiPanel").classList.contains("hidden")) renderHistory(); };
})();
