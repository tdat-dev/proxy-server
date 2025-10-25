// Translation Proxy Server for Gemini API
// Provides secure, cached, rate-limited translation endpoint

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// In-memory cache (use Redis/KV in production)
const translationCache = new Map();
const CACHE_TTL_MS = (process.env.CACHE_TTL_HOURS || 72) * 60 * 60 * 1000;

// Language name mappings for Gemini prompts
const LANGUAGE_NAMES = {
  vi: "Vietnamese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  auto: "auto-detect",
};

// Middleware: JSON parsing
app.use(express.json({ limit: "10mb" }));

// Middleware: CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["*"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // Allow chrome-extension:// origins
      if (origin.startsWith("chrome-extension://")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  })
);

// Middleware: Rate limiting (60 requests per minute per IP)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for trusted IPs (optional)
  skip: (req) => {
    const trustedIPs = process.env.TRUSTED_IPS?.split(",") || [];
    return trustedIPs.includes(req.ip);
  },
});

app.use("/translate", limiter);

// Utility: Generate cache key
function generateCacheKey(text, sourceLang, targetLang, provider) {
  const data = JSON.stringify({ text, sourceLang, targetLang, provider });
  return crypto.createHash("sha1").update(data).digest("hex");
}

// Utility: Clean and normalize text (preserve line breaks)
function normalizeText(text) {
  // Only trim and normalize spaces within lines, but keep line breaks
  return text
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n"); // Max 2 consecutive line breaks
}

// Utility: Detect language using Gemini
async function detectLanguage(text) {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `Detect the language of the following text and respond with ONLY the ISO 639-1 two-letter language code (e.g., "en", "vi", "ja", "ko", "zh", "es", etc.). No explanations.

Text: "${text.substring(0, 500)}"

Language code:`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 10,
      },
    });

    const detectedLang = result.response.text().trim().toLowerCase();

    // Validate it's a 2-letter code
    if (/^[a-z]{2}$/.test(detectedLang)) {
      return detectedLang;
    }

    // Fallback to 'en' if detection fails
    console.warn('Language detection failed, defaulting to "en"');
    return "en";
  } catch (error) {
    console.error("Language detection error:", error);
    return "en"; // Fallback
  }
}

// Utility: Translate text using Gemini
async function translateText(text, sourceLang, targetLang) {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

    const systemPrompt = `You are a professional translation engine. Translate the given text from ${sourceLangName} to ${targetLangName}.

CRITICAL RULES:
1. PRESERVE ALL line breaks exactly as they appear in the original text
2. Keep ALL formatting: code blocks (\`\`\`), HTML tags, markdown
3. Keep emojis and special characters unchanged
4. Do NOT add explanations, notes, or extra text
5. Return ONLY the translated text with same line structure
6. If text contains code, translate only comments and strings, not code syntax
7. Each line in original = each line in translation
8. Maintain the same tone and style

IMPORTANT: If the original text has multiple lines, your translation MUST have the same number of lines.`;

    const prompt = `${systemPrompt}

Text to translate:
${text}

Translated text:`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // Low temperature for deterministic output
        maxOutputTokens: 8192,
      },
    });

    const translatedText = result.response.text().trim();
    console.log("Raw Gemini response:", JSON.stringify(translatedText)); // Debug
    return translatedText;
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error(`Translation failed: ${error.message}`);
  }
}

// Utility: Clean up expired cache entries
function cleanupCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of translationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      translationCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Cache cleanup: removed ${cleaned} expired entries`);
  }
}

// Run cache cleanup every hour
setInterval(cleanupCache, 60 * 60 * 1000);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    cacheSize: translationCache.size,
    timestamp: new Date().toISOString(),
  });
});

// Main translation endpoint
app.post("/translate", async (req, res) => {
  try {
    const { text, sourceLang = "auto", targetLang, provider } = req.body;

    // Validation: text
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({
        error:
          'Invalid request: "text" is required and must be a non-empty string',
      });
    }

    // Validation: targetLang
    if (!targetLang || typeof targetLang !== "string") {
      return res.status(400).json({
        error: 'Invalid request: "targetLang" is required',
      });
    }

    // Validation: provider
    if (provider !== "gemini") {
      return res.status(400).json({
        error: 'Invalid request: "provider" must be "gemini"',
      });
    }

    // Normalize text
    const normalizedText = normalizeText(text);

    // Auto-detect source language if needed
    let detectedSourceLang = sourceLang;
    if (sourceLang === "auto") {
      console.log("Auto-detecting language...");
      detectedSourceLang = await detectLanguage(normalizedText);
      console.log(`Detected language: ${detectedSourceLang}`);
    }

    // Short-circuit: if source and target are the same
    if (detectedSourceLang === targetLang) {
      console.log(
        "Source and target languages are the same, returning original text"
      );
      return res.json({
        translation: normalizedText,
        cached: false,
        detectedSourceLang: detectedSourceLang,
      });
    }

    // Generate cache key
    const cacheKey = generateCacheKey(
      normalizedText,
      detectedSourceLang,
      targetLang,
      provider
    );

    // Check cache
    const cached = translationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log("Cache hit:", cacheKey);
      return res.json({
        translation: cached.translation,
        cached: true,
        detectedSourceLang: detectedSourceLang,
      });
    }

    // Translate using Gemini
    console.log(`Translating from ${detectedSourceLang} to ${targetLang}...`);
    console.log("Original text:", JSON.stringify(normalizedText)); // Debug
    const translation = await translateText(
      normalizedText,
      detectedSourceLang,
      targetLang
    );
    console.log("Translated text:", JSON.stringify(translation)); // Debug

    // Store in cache
    translationCache.set(cacheKey, {
      translation: translation,
      timestamp: Date.now(),
    });

    console.log("Translation successful, cached with key:", cacheKey);

    // Return result
    res.json({
      translation: translation,
      cached: false,
      detectedSourceLang: detectedSourceLang,
    });
  } catch (error) {
    console.error("Translation endpoint error:", error);

    // Determine appropriate status code
    const statusCode = error.message.includes("API key")
      ? 401
      : error.message.includes("quota")
      ? 429
      : error.message.includes("Translation failed")
      ? 502
      : 500;

    res.status(statusCode).json({
      error: "Translation service error",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "An error occurred during translation",
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: "Endpoint not found. Use POST /translate",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS error",
      message: "Origin not allowed",
    });
  }

  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "An unexpected error occurred",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Translation Proxy Server Running                        ║
╚══════════════════════════════════════════════════════════╝

  Port:        ${PORT}
  Model:       ${MODEL_NAME}
  Cache TTL:   ${CACHE_TTL_MS / 1000 / 60 / 60}h
  Rate Limit:  ${process.env.RATE_LIMIT_MAX_REQUESTS || 60} req/min
  Environment: ${process.env.NODE_ENV || "development"}
  
  Endpoints:
  - POST /translate  → Main translation endpoint
  - GET  /health     → Health check
  
  Ready to accept requests! 🚀
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\nSIGINT received, shutting down gracefully...");
  process.exit(0);
});
