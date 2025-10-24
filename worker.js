// Cloudflare Workers Translation Proxy
// Serverless edge translation with KV cache and Gemini API

// Language name mappings
const LANGUAGE_NAMES = {
  vi: "Vietnamese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  auto: "auto-detect",
};

// Cache TTL in seconds (72 hours)
const CACHE_TTL = 72 * 60 * 60;

// Rate limiting config
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per window

// Utility: Generate SHA-1 hash for cache key
async function generateCacheKey(text, sourceLang, targetLang, provider) {
  const data = JSON.stringify({ text, sourceLang, targetLang, provider });
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-1", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Utility: Normalize text
function normalizeText(text) {
  return text.trim().replace(/\s+/g, " ");
}

// Utility: Detect language using Gemini
async function detectLanguage(text, apiKey, model) {
  const prompt = `Detect the language of the following text and respond with ONLY the ISO 639-1 two-letter language code (e.g., "en", "vi", "ja", "ko", "zh", "es", etc.). No explanations.

Text: "${text.substring(0, 500)}"

Language code:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 10,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Language detection failed: ${response.statusText}`);
  }

  const data = await response.json();
  const detectedLang = data.candidates[0].content.parts[0].text
    .trim()
    .toLowerCase();

  // Validate 2-letter code
  if (/^[a-z]{2}$/.test(detectedLang)) {
    return detectedLang;
  }

  // Fallback
  return "en";
}

// Utility: Translate using Gemini
async function translateText(text, sourceLang, targetLang, apiKey, model) {
  const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

  const systemPrompt = `You are a professional translation engine. Translate the given text from ${sourceLangName} to ${targetLangName}.

CRITICAL RULES:
1. Preserve ALL formatting: code blocks (\`\`\`), HTML tags, markdown, line breaks
2. Keep emojis and special characters unchanged
3. Do NOT add explanations, notes, or extra text
4. Return ONLY the translated text
5. If text contains code, translate only comments and strings, not code syntax
6. Maintain the same tone and style`;

  const prompt = `${systemPrompt}

Text to translate:
${text}

Translated text:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    throw new Error(
      `Translation failed: ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// Rate limiting using KV
async function checkRateLimit(env, clientIP) {
  const key = `ratelimit:${clientIP}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  // Get current count
  const data = await env.TRANSLATION_CACHE.get(key, { type: "json" });

  if (!data) {
    // First request
    await env.TRANSLATION_CACHE.put(
      key,
      JSON.stringify({ count: 1, windowStart: now }),
      { expirationTtl: RATE_LIMIT_WINDOW }
    );
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  // Check if window expired
  if (data.windowStart < windowStart) {
    // New window
    await env.TRANSLATION_CACHE.put(
      key,
      JSON.stringify({ count: 1, windowStart: now }),
      { expirationTtl: RATE_LIMIT_WINDOW }
    );
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  // Within window
  if (data.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, retryAfter: RATE_LIMIT_WINDOW };
  }

  // Increment count
  await env.TRANSLATION_CACHE.put(
    key,
    JSON.stringify({ count: data.count + 1, windowStart: data.windowStart }),
    { expirationTtl: RATE_LIMIT_WINDOW }
  );

  return { allowed: true, remaining: RATE_LIMIT_MAX - data.count - 1 };
}

// CORS headers
function getCorsHeaders(origin, allowedOrigins) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };

  // Allow chrome-extension:// origins
  if (origin.startsWith("chrome-extension://")) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (allowedOrigins.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

// Main handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    // Parse allowed origins
    const allowedOrigins = (env.ALLOWED_ORIGINS || "*")
      .split(",")
      .map((o) => o.trim());
    const corsHeaders = getCorsHeaders(origin, allowedOrigins);

    // Handle OPTIONS (preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          region: request.cf?.colo || "unknown",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Translation endpoint
    if (url.pathname === "/translate" && request.method === "POST") {
      try {
        // Rate limiting
        const rateLimit = await checkRateLimit(env, clientIP);

        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({
              error: "Too many requests",
              retryAfter: rateLimit.retryAfter,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": rateLimit.retryAfter.toString(),
                ...corsHeaders,
              },
            }
          );
        }

        // Parse request
        const body = await request.json();
        const { text, sourceLang = "auto", targetLang, provider } = body;

        // Validation
        if (!text || typeof text !== "string" || text.trim().length === 0) {
          return new Response(
            JSON.stringify({
              error:
                'Invalid request: "text" is required and must be a non-empty string',
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        if (!targetLang) {
          return new Response(
            JSON.stringify({
              error: 'Invalid request: "targetLang" is required',
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        if (provider !== "gemini") {
          return new Response(
            JSON.stringify({
              error: 'Invalid request: "provider" must be "gemini"',
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        // Normalize text
        const normalizedText = normalizeText(text);

        // Auto-detect language if needed
        let detectedSourceLang = sourceLang;
        if (sourceLang === "auto") {
          detectedSourceLang = await detectLanguage(
            normalizedText,
            env.GOOGLE_API_KEY,
            env.GEMINI_MODEL || "gemini-2.5-flash"
          );
        }

        // Short-circuit if source equals target
        if (detectedSourceLang === targetLang) {
          return new Response(
            JSON.stringify({
              translation: normalizedText,
              cached: false,
              detectedSourceLang: detectedSourceLang,
            }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        // Generate cache key
        const cacheKey = await generateCacheKey(
          normalizedText,
          detectedSourceLang,
          targetLang,
          provider
        );

        // Check KV cache
        const cached = await env.TRANSLATION_CACHE.get(cacheKey, {
          type: "json",
        });

        if (cached && cached.translation) {
          return new Response(
            JSON.stringify({
              translation: cached.translation,
              cached: true,
              detectedSourceLang: detectedSourceLang,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "X-Cache": "HIT",
                ...corsHeaders,
              },
            }
          );
        }

        // Check API key
        if (!env.GOOGLE_API_KEY) {
          return new Response(
            JSON.stringify({
              error: "Server configuration error: API key not set",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        // Translate using Gemini
        const translation = await translateText(
          normalizedText,
          detectedSourceLang,
          targetLang,
          env.GOOGLE_API_KEY,
          env.GEMINI_MODEL || "gemini-2.5-flash"
        );

        // Store in KV cache
        await env.TRANSLATION_CACHE.put(
          cacheKey,
          JSON.stringify({ translation, timestamp: Date.now() }),
          { expirationTtl: CACHE_TTL }
        );

        // Return result
        return new Response(
          JSON.stringify({
            translation: translation,
            cached: false,
            detectedSourceLang: detectedSourceLang,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "X-Cache": "MISS",
              ...corsHeaders,
            },
          }
        );
      } catch (error) {
        console.error("Translation error:", error);

        return new Response(
          JSON.stringify({
            error: "Translation service error",
            message: error.message,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    }

    // 404
    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "Endpoint not found. Use POST /translate",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  },
};
