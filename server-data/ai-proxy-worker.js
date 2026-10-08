/**
 * CAMPUS MARKET — Server-side Business AI
 * File: server/ai.js
 *
 * Keeps GEMINI_API_KEY on the server and exposes:
 *   POST /api/ai/chat
 *   GET  /api/ai/health
 *
 * Requires:
 *   npm install express
 *
 * Environment:
 *   GEMINI_API_KEY=...
 *   GEMINI_MODEL=gemini-2.5-flash
 */

const express = require("express");

const router = express.Router();

const API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
const MAX_MESSAGES = 14;
const MAX_TEXT = 8000;
const MAX_IMAGE_BASE64 = 8 * 1024 * 1024;

function cleanText(value, max = MAX_TEXT) {
  return String(value ?? "").slice(0, max);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_MESSAGES).map(m => ({
    role: m && m.role === "assistant" ? "model" : "user",
    text: cleanText(m && m.text)
  })).filter(m => m.text.trim());
}

function systemPrompt(catalogue) {
  return [
    "You are Business AI, the built-in assistant of CAMPUS MARKET.",
    "CAMPUS MARKET is an online marketplace serving shoppers and small businesses in Uganda. Prices are normally in UGX.",
    "Only answer business and shopping topics: products, product comparisons, pricing, sellers, delivery, pickup, payments, small-business growth, marketing, stock and customer service.",
    "Be professional, warm and concise. Normally stay below 150 words.",
    "Never invent CAMPUS MARKET products or prices. When catalogue data is supplied, use only that data for marketplace-specific claims.",
    "If an image is supplied, describe only what can reasonably be seen. Do not claim certainty about authenticity, hidden defects or exact condition from a photograph.",
    "If the question is unrelated to business/shopping, politely redirect the visitor to CAMPUS MARKET topics.",
    "CURRENT CAMPUS MARKET CATALOGUE:",
    catalogue || "(no catalogue supplied)"
  ].join("\n\n");
}

function makeContents(history, image) {
  const contents = history.map((m, index) => {
    const parts = [{ text: m.text }];

    // Attach the image only to the newest user message.
    if (image && index === history.length - 1 && m.role === "user") {
      parts.push({
        inline_data: {
          mime_type: image.mime,
          data: image.data
        }
      });
    }

    return { role: m.role, parts };
  });

  return contents;
}

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "campus-market-business-ai",
    configured: Boolean(API_KEY),
    model: MODEL
  });
});

router.post("/chat", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const body = req.body || {};
    const question = cleanText(body.question);
    const history = normalizeHistory(body.history);
    const catalogue = cleanText(body.catalogue, 30000);

    if (!question && !history.length) {
      return res.status(400).json({ ok: false, error: "A question is required." });
    }

    let image = null;
    if (body.image) {
      const mime = String(body.image.mime || "");
      const data = String(body.image.data || "");

      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) {
        return res.status(400).json({ ok: false, error: "Unsupported image type." });
      }
      if (!data || data.length > MAX_IMAGE_BASE64) {
        return res.status(400).json({ ok: false, error: "Image is missing or too large." });
      }

      image = { mime: mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime, data };
    }

    const effectiveHistory = history.length
      ? history
      : [{ role: "user", text: question }];

    // If the frontend supplied history but the newest message is absent,
    // append the current question.
    if (question && effectiveHistory[effectiveHistory.length - 1].text !== question) {
      effectiveHistory.push({ role: "user", text: question });
    }

    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt(catalogue) }]
      },
      contents: makeContents(effectiveHistory.slice(-MAX_MESSAGES), image),
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 700
      }
    };

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(MODEL) +
      ":generateContent?key=" +
      encodeURIComponent(API_KEY);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `Gemini request failed with HTTP ${response.status}`;
      return res.status(502).json({ ok: false, error: message });
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const answer = parts
      .map(p => typeof p.text === "string" ? p.text : "")
      .join("")
      .trim();

    if (!answer) {
      return res.status(502).json({
        ok: false,
        error: "Gemini returned an empty answer."
      });
    }

    res.json({
      ok: true,
      answer,
      provider: "Google Gemini",
      model: MODEL
    });
  } catch (error) {
    console.error("CAMPUS MARKET AI error:", error);
    res.status(500).json({
      ok: false,
      error: error.name === "AbortError"
        ? "AI request timed out."
        : "The AI service could not be reached."
    });
  }
});

module.exports = router;
