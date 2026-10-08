/**
 * CAMPUS MARKET — Business AI browser client
 * File: js/business-ai.js
 *
 * This version talks to /api/ai/chat.
 * The Gemini API key NEVER belongs in this browser file.
 *
 * Required HTML IDs:
 * baiPanel, baiToggle, baiCloseBtn, baiBody, baiInput,
 * baiSend, baiPhotoBtn, baiFile, baiAttach, baiClearBtn
 */
(function () {
  "use strict";

  const MAX_STORED = 60;
  const CONTEXT_TURNS = 14;
  let pendingImage = null;
  let busy = false;

  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    }[c]));
  }

  function fmt(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/\n/g, "<br>");
  }

  function memoryKey() {
    let id = "guest";
    try {
      const s = window.FMG && typeof FMG.getSession === "function"
        ? FMG.getSession()
        : null;
      if (s && s.id) id = String(s.type || "user") + "_" + String(s.id);
    } catch (_) {}
    return "fmg_ai_chat_" + id;
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(memoryKey())) || [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(h) {
    try {
      localStorage.setItem(
        memoryKey(),
        JSON.stringify(h.slice(-MAX_STORED))
      );
    } catch (_) {}
  }

  function addBubble(role, text, imageSrc) {
    const body = $("baiBody");
    if (!body) return null;

    const d = document.createElement("div");
    d.className = "bai-msg " + role;
    d.innerHTML = fmt(text);

    if (imageSrc) {
      const img = document.createElement("img");
      img.src = imageSrc;
      img.alt = "Attached image";
      d.prepend(img);
    }

    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }

  function renderHistory() {
    const body = $("baiBody");
    if (!body) return;

    body.innerHTML = "";
    const h = loadHistory();

    if (!h.length) {
      addBubble(
        "bot",
        "Hello, I'm the **Business AI**. Ask me about products, prices, sellers, delivery, payments or growing a small business. You can also attach a product photo."
      );
    } else {
      h.forEach(m => {
        addBubble(
          m.role === "user" ? "user" : "bot",
          m.text
        );
      });
    }

    const clear = $("baiClearBtn");
    if (clear) clear.style.display = h.length ? "" : "none";
  }

  function catalogueContext() {
    try {
      if (!window.FMG || typeof FMG.getProducts !== "function") {
        return "(catalogue unavailable)";
      }

      const businesses =
        typeof FMG.getBusinesses === "function"
          ? FMG.getBusinesses()
          : [];

      return FMG.getProducts().slice(0, 60).map(p => {
        const b = businesses.find(x => x.id === p.bizId);
        const price = p.discount
          ? Math.round(Number(p.price) * (1 - Number(p.discount) / 100))
          : Number(p.price);

        let category = p.category || "";
        try {
          category = FMG.categoryById(p.category)?.label || category;
        } catch (_) {}

        return `- ${p.name} | ${category} | UGX ${price}` +
          (p.discount ? ` (${p.discount}% off)` : "") +
          ` | seller: ${b ? b.name : "unknown"}` +
          (p.description ? ` | ${String(p.description).slice(0, 120)}` : "");
      }).join("\n") || "(no products listed yet)";
    } catch (_) {
      return "(catalogue unavailable)";
    }
  }

  async function askServer(history, image) {
    const recent = history.slice(-CONTEXT_TURNS);

    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: recent[recent.length - 1]?.text || "",
        history: recent,
        catalogue: catalogueContext(),
        image: image ? {
          mime: image.mime,
          data: image.data
        } : null
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "AI server error");
    }

    return data.answer;
  }

  function builtInAnswer(q) {
    const t = String(q).toLowerCase();

    if (/hello|hi|hey/.test(t)) {
      return "Hello! I'm the Business AI. I can help with products, payments, delivery, discounts and businesses on CAMPUS MARKET.";
    }

    if (/pay|momo|airtel|mastercard/.test(t)) {
      return "CAMPUS MARKET supports the payment methods offered by the sellers in your cart. Check the available methods at checkout.";
    }

    if (/deliver|pickup|shipping/.test(t)) {
      return "Check the product and checkout page for the seller's available delivery or pickup options and the final delivery fee.";
    }

    if (/business|sell|register|marketing/.test(t)) {
      return "For better sales, use clear product photos, accurate prices and descriptions, keep stock updated and respond quickly to customers.";
    }

    return "I can help with products, sellers, prices, payments, delivery and business questions on CAMPUS MARKET.";
  }

  async function send(textOverride) {
    if (busy) return;

    const input = $("baiInput");
    if (!input) return;

    const text = String(textOverride || input.value || "").trim();
    if (!text && !pendingImage) return;

    const question = text || "What can you tell me about this picture?";
    input.value = "";

    const image = pendingImage;
    pendingImage = null;
    renderAttachChip();

    const history = loadHistory();

    history.push({
      role: "user",
      text: question,
      at: Date.now(),
      hadImage: Boolean(image)
    });

    saveHistory(history);

    addBubble(
      "user",
      question,
      image ? `data:${image.mime};base64,${image.data}` : null
    );

    const sendButton = $("baiSend");
    busy = true;
    if (sendButton) sendButton.disabled = true;

    const typing = addBubble("bot", "Thinking…");
    if (typing) typing.classList.add("typing");

    let answer;

    try {
      answer = await askServer(history, image);
    } catch (error) {
      console.warn("Business AI server unavailable:", error);
      answer = builtInAnswer(question);

      if (image) {
        answer =
          "I can't analyse the picture right now, but " +
          answer.charAt(0).toLowerCase() +
          answer.slice(1);
      }
    }

    if (typing) typing.remove();

    addBubble("bot", answer);

    history.push({
      role: "assistant",
      text: answer,
      at: Date.now()
    });

    saveHistory(history);

    busy = false;
    if (sendButton) sendButton.disabled = false;
    input.focus();
  }

  function renderAttachChip() {
    const c = $("baiAttach");
    if (!c) return;

    if (!pendingImage) {
      c.classList.add("hidden");
      c.innerHTML = "";
      return;
    }

    c.classList.remove("hidden");
    c.innerHTML =
      '<img src="data:' + pendingImage.mime +
      ';base64,' + pendingImage.data +
      '" alt="">' +
      "<span>" + esc(pendingImage.label) + "</span>" +
      '<button type="button" aria-label="Remove image">&times;</button>';

    c.querySelector("button").onclick = () => {
      pendingImage = null;
      renderAttachChip();
    };
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();

      fr.onerror = reject;

      fr.onload = () => {
        const im = new Image();

        im.onerror = reject;

        im.onload = () => {
          const scale = Math.min(
            1,
            900 / Math.max(im.width, im.height)
          );

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(im.width * scale));
          canvas.height = Math.max(1, Math.round(im.height * scale));

          const ctx = canvas.getContext("2d");
          ctx.drawImage(im, 0, 0, canvas.width, canvas.height);

          resolve({
            mime: "image/jpeg",
            data: canvas
              .toDataURL("image/jpeg", 0.8)
              .split(",")[1],
            label: file.name || "photo"
          });
        };

        im.src = fr.result;
      };

      fr.readAsDataURL(file);
    });
  }

  function openPanel() {
    const panel = $("baiPanel");
    const toggle = $("baiToggle");
    if (!panel) return;

    panel.classList.remove("hidden");
    if (toggle) toggle.classList.add("hidden");
    renderHistory();
  }

  function closePanel() {
    const panel = $("baiPanel");
    const toggle = $("baiToggle");

    if (panel) panel.classList.add("hidden");
    if (toggle) toggle.classList.remove("hidden");
  }

  window.askBusinessAIAboutProduct = function (productId) {
    try {
      const p = FMG.getProducts().find(x => x.id === productId);
      if (!p) return;

      openPanel();

      let business = null;
      try {
        business = FMG.businessById(p.bizId);
      } catch (_) {}

      if (
        typeof p.image === "string" &&
        p.image.indexOf("data:image") === 0
      ) {
        pendingImage = {
          mime: p.image.slice(5, p.image.indexOf(";")),
          data: p.image.split(",")[1],
          label: p.name
        };
        renderAttachChip();
      }

      send(
        `Tell me about "${p.name}" from ` +
        `${business ? business.name : "this seller"}: ` +
        `what does the picture show, is the price fair, ` +
        `and what should I check before buying?`
      );
    } catch (error) {
      console.error(error);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (!$("baiPanel")) return;

    if ($("baiToggle")) $("baiToggle").onclick = openPanel;
    if ($("baiCloseBtn")) $("baiCloseBtn").onclick = closePanel;
    if ($("baiSend")) $("baiSend").onclick = () => send();

    if ($("baiInput")) {
      $("baiInput").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
    }

    if ($("baiPhotoBtn") && $("baiFile")) {
      $("baiPhotoBtn").onclick = () => $("baiFile").click();

      $("baiFile").onchange = async e => {
        const f = e.target.files[0];
        e.target.value = "";

        if (!f || !/^image\//.test(f.type)) return;

        try {
          pendingImage = await fileToImage(f);
          renderAttachChip();
        } catch (_) {
          if (typeof window.showToast === "function") {
            window.showToast("Couldn't read that image.");
          }
        }
      };
    }

    if ($("baiClearBtn")) {
      $("baiClearBtn").onclick = () => {
        if (confirm("Delete your Business AI chat history on this device?")) {
          localStorage.removeItem(memoryKey());
          renderHistory();
        }
      };
    }

    document.querySelectorAll(".bai-quick button").forEach(button => {
      button.onclick = () => send(button.textContent);
    });
  });

  window.businessAIRefresh = renderHistory;
})();
