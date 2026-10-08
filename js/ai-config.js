/* ==========================================================================
   BUSINESS AI: provider list (free AI services it can use)
   --------------------------------------------------------------------------
   Business AI is a router. For each question it asks one free AI service in the
   background and shows the answer inside CAMPUS MARKET. If that service is busy,
   out of free quota, or down, it automatically tries the next one.

   HOW TO ADD A SERVICE: get a free API key from its website (links below),
   paste it into apiKey. Providers with an empty apiKey are simply skipped.
   You can add as many as you like; each free tier is separate, so more keys =
   more free usage. Free plans and model names change often: if a service stops
   answering, check its website for the current free model name and edit "model".

   IMPORTANT: some AI websites (for example the free web versions of ChatGPT or
   Claude) have NO key and cannot be called from another site, so they cannot be
   included. Only services that publish a free API can be used.

   SECURITY: this is a static site, so any key written here can be read by
   visitors. Use keys that are free-tier only (no card attached), restrict them
   where the provider allows it, and for a serious launch set proxyUrl to the
   small server in server/ai-proxy-worker.js so keys stay secret on the server.
   ========================================================================== */
const BUSINESS_AI_CONFIG = {
  enabled: true,
  mode: "failover",       // "failover" = best order with fallback. "spread" = rotate the first choice to share free limits.
  proxyUrl: "",           // optional: your own server (see server/ai-proxy-worker.js). Then set viaProxy:true on providers.
  timeoutMs: 20000,
  providers: [
    // ---- Google Gemini: https://aistudio.google.com/apikey  (also reads pictures and can search the web)
    { id: "gemini",     name: "Google Gemini",   type: "gemini", model: "gemini-2.5-flash",                       apiKey: "", vision: true, search: true },
    // ---- Groq: https://console.groq.com/keys
    { id: "groq",       name: "Groq",            type: "openai", url: "https://api.groq.com/openai/v1/chat/completions",       model: "llama-3.3-70b-versatile",        apiKey: "" },
    // ---- OpenRouter (many ":free" models): https://openrouter.ai/keys
    { id: "openrouter", name: "OpenRouter",      type: "openai", url: "https://openrouter.ai/api/v1/chat/completions",         model: "meta-llama/llama-3.3-70b-instruct:free", apiKey: "" },
    // ---- Mistral: https://console.mistral.ai/api-keys
    { id: "mistral",    name: "Mistral",         type: "openai", url: "https://api.mistral.ai/v1/chat/completions",            model: "mistral-small-latest",           apiKey: "", vision: true },
    // ---- Cerebras: https://cloud.cerebras.ai
    { id: "cerebras",   name: "Cerebras",        type: "openai", url: "https://api.cerebras.ai/v1/chat/completions",           model: "llama-3.3-70b",                  apiKey: "" },
    // ---- SambaNova: https://cloud.sambanova.ai
    { id: "sambanova",  name: "SambaNova",       type: "openai", url: "https://api.sambanova.ai/v1/chat/completions",          model: "Meta-Llama-3.3-70B-Instruct",    apiKey: "" },
    // ---- Hugging Face: https://huggingface.co/settings/tokens
    { id: "huggingface",name: "Hugging Face",    type: "openai", url: "https://router.huggingface.co/v1/chat/completions",     model: "meta-llama/Llama-3.3-70B-Instruct", apiKey: "" },
    // ---- GitHub Models: https://github.com/marketplace/models  (token from GitHub settings)
    { id: "github",     name: "GitHub Models",   type: "openai", url: "https://models.github.ai/inference/chat/completions",   model: "openai/gpt-4.1-mini",            apiKey: "", vision: true },
    // ---- NVIDIA NIM: https://build.nvidia.com
    { id: "nvidia",     name: "NVIDIA NIM",      type: "openai", url: "https://integrate.api.nvidia.com/v1/chat/completions",  model: "meta/llama-3.3-70b-instruct",    apiKey: "" },
    // ---- Together AI: https://api.together.ai
    { id: "together",   name: "Together AI",     type: "openai", url: "https://api.together.xyz/v1/chat/completions",          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", apiKey: "" }
    // To add another service that offers an "OpenAI-compatible" API, copy a line above and change id, name, url, model, apiKey.
  ]
};
