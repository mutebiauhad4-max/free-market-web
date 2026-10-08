/* Optional key-hiding proxy for Business AI (Cloudflare Workers, free plan).
   The browser sends { provider, model, payload } here; this worker adds the secret
   key and forwards to the AI service, so keys never appear in your website.

   Setup (about 10 minutes):
   1. Create a free Cloudflare account > Workers & Pages > Create Worker, paste this file.
   2. Settings > Variables and Secrets: add the keys you have as secrets, named
      GEMINI_KEY, GROQ_KEY, OPENROUTER_KEY, MISTRAL_KEY, CEREBRAS_KEY, SAMBANOVA_KEY,
      HUGGINGFACE_KEY, GITHUB_KEY, NVIDIA_KEY, TOGETHER_KEY. Also add ALLOWED_ORIGIN =
      https://mutebiauhad4-max.github.io
   3. Put the worker's address in js/ai-config.js as proxyUrl, and add viaProxy: true
      to each provider you stored a secret for (apiKey can then stay empty).
   NOTE: written carefully but not yet run against live services; test one question per provider. */
const OPENAI_URLS = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cerebras: "https://api.cerebras.ai/v1/chat/completions",
  sambanova: "https://api.sambanova.ai/v1/chat/completions",
  huggingface: "https://router.huggingface.co/v1/chat/completions",
  github: "https://models.github.ai/inference/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  together: "https://api.together.xyz/v1/chat/completions"
};
export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = {
      "Access-Control-Allow-Origin": origin === allowed ? origin : "null",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || origin !== allowed) return new Response("Forbidden", { status: 403, headers: cors });
    let msg;
    try { msg = await req.json(); } catch (e) { return new Response("Bad request", { status: 400, headers: cors }); }
    const { provider, model, payload } = msg || {};
    const key = env[String(provider || "").toUpperCase() + "_KEY"];
    if (!key || !payload) return new Response("Provider not configured", { status: 404, headers: cors });
    let url, headers = { "Content-Type": "application/json" };
    if (provider === "gemini") {
      url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
      headers["x-goog-api-key"] = key;
    } else if (OPENAI_URLS[provider]) {
      url = OPENAI_URLS[provider];
      headers["Authorization"] = "Bearer " + key;
    } else return new Response("Unknown provider", { status: 404, headers: cors });
    const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    return new Response(await upstream.text(), { status: upstream.status, headers: Object.assign({ "Content-Type": "application/json" }, cors) });
  }
};
