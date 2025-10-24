# Translation Proxy Server

Secure translation proxy for Google Gemini API with caching, rate limiting, and language auto-detection.

## Features

- 🔒 **Secure** - API key hidden from clients
- ⚡ **Fast** - In-memory cache with 72h TTL (upgradeable to Redis)
- 🛡️ **Protected** - Rate limiting (60 req/min per IP)
- 🌍 **Auto-detect** - Automatic source language detection
- 🎯 **Accurate** - Preserves code blocks, HTML, emojis, and formatting
- 📊 **Production-ready** - Health checks, error handling, CORS

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- Google AI Studio API key ([Get one here](https://makersuite.google.com/app/apikey))

### 2. Installation

```bash
cd proxy-server
npm install
```

### 3. Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_API_KEY=your_actual_gemini_api_key
PORT=3000
GEMINI_MODEL=gemini-1.5-flash
CACHE_TTL_HOURS=72
RATE_LIMIT_MAX_REQUESTS=60
ALLOWED_ORIGINS=*
```

### 4. Run Server

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

Server runs at `http://localhost:3000`

### 5. Test It

In a new terminal:

```bash
npm test
```

Or manually test with curl:

```bash
curl -X POST http://localhost:3000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "sourceLang": "en",
    "targetLang": "vi",
    "provider": "gemini"
  }'
```

Expected response:

```json
{
  "translation": "Xin chào thế giới",
  "cached": false,
  "detectedSourceLang": "en"
}
```

## API Reference

### POST /translate

Translates text using Google Gemini.

**Request Body:**

```json
{
  "text": "Text to translate",
  "sourceLang": "auto", // or "en", "vi", "ja", "ko", "zh"
  "targetLang": "vi", // required: "en", "vi", "ja", "ko", "zh"
  "provider": "gemini" // required: must be "gemini"
}
```

**Response (Success - 200):**

```json
{
  "translation": "Translated text",
  "cached": false,
  "detectedSourceLang": "en"
}
```

**Response (Error - 4xx/5xx):**

```json
{
  "error": "Error type",
  "message": "Error description"
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "uptime": 123.45,
  "cacheSize": 42,
  "timestamp": "2025-10-24T12:00:00.000Z"
}
```

## Test Cases

### Test 1: Simple Translation

```bash
curl -X POST http://localhost:3000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "sourceLang": "en",
    "targetLang": "vi",
    "provider": "gemini"
  }'
```

### Test 2: Mixed Code (preserves code blocks)

````bash
curl -X POST http://localhost:3000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The function returns a Promise.\n\n```js\nasync function x(){...}\n```",
    "sourceLang": "en",
    "targetLang": "vi",
    "provider": "gemini"
  }'
````

### Test 3: Emoji & Long Text

```bash
curl -X POST http://localhost:3000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Welcome to AI! 🚀 This is amazing! 🌟 Modern technology enables...",
    "sourceLang": "en",
    "targetLang": "vi",
    "provider": "gemini"
  }'
```

### Test 4: Auto-detect Japanese

```bash
curl -X POST http://localhost:3000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "こんにちは！今日はとても良い天気ですね。",
    "sourceLang": "auto",
    "targetLang": "en",
    "provider": "gemini"
  }'
```

Expected: Detects `ja` and translates to English.

### Test 5: Cache Test

Run Test 1 twice - second request should return `"cached": true` and be instant.

## Deployment

### Option 1: Vercel

1. Install Vercel CLI:

```bash
npm install -g vercel
```

2. Create `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ],
  "env": {
    "GOOGLE_API_KEY": "@google_api_key",
    "GEMINI_MODEL": "gemini-1.5-flash",
    "CACHE_TTL_HOURS": "72",
    "RATE_LIMIT_MAX_REQUESTS": "60",
    "ALLOWED_ORIGINS": "chrome-extension://your-extension-id"
  }
}
```

3. Deploy:

```bash
vercel --prod
```

4. Set environment variable:

```bash
vercel env add GOOGLE_API_KEY
```

### Option 2: Render

1. Create `render.yaml`:

```yaml
services:
  - type: web
    name: translation-proxy
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: GOOGLE_API_KEY
        sync: false
      - key: PORT
        value: 10000
      - key: GEMINI_MODEL
        value: gemini-1.5-flash
      - key: CACHE_TTL_HOURS
        value: 72
      - key: RATE_LIMIT_MAX_REQUESTS
        value: 60
      - key: ALLOWED_ORIGINS
        value: chrome-extension://your-extension-id
```

2. Push to GitHub and connect to Render
3. Set `GOOGLE_API_KEY` in Render dashboard

### Option 3: Fly.io

1. Install Fly CLI:

```bash
curl -L https://fly.io/install.sh | sh
```

2. Create `fly.toml`:

```toml
app = "translation-proxy"
primary_region = "sjc"

[build]
  builder = "heroku/buildpacks:20"

[env]
  PORT = "8080"
  GEMINI_MODEL = "gemini-1.5-flash"
  CACHE_TTL_HOURS = "72"
  RATE_LIMIT_MAX_REQUESTS = "60"

[[services]]
  http_checks = []
  internal_port = 8080
  processes = ["app"]
  protocol = "tcp"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

3. Deploy:

```bash
fly launch
fly secrets set GOOGLE_API_KEY=your_key_here
fly deploy
```

### Option 4: Railway

1. Push to GitHub
2. Connect to Railway: https://railway.app/
3. Add environment variables in dashboard
4. Deploy automatically on push

## Production Considerations

### 1. Cache Storage

**Current:** In-memory Map (data lost on restart)

**Production:** Use Redis or similar:

```javascript
// Install: npm install redis
const redis = require("redis");
const client = redis.createClient({
  url: process.env.REDIS_URL,
});

await client.connect();

// Set cache
await client.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data));

// Get cache
const cached = await client.get(cacheKey);
```

### 2. Rate Limiting

**Current:** In-memory (per-instance)

**Production:** Use Redis store for distributed rate limiting:

```javascript
const RedisStore = require("rate-limit-redis");

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
  }),
  // ... other options
});
```

### 3. Monitoring

Add monitoring service:

- **Sentry** for error tracking
- **Datadog/New Relic** for performance
- **LogDNA/Papertrail** for logs

### 4. Security

- Set `ALLOWED_ORIGINS` to your actual extension ID
- Use HTTPS in production (handled by deployment platforms)
- Keep API key in environment variables (never commit)
- Monitor API usage to prevent abuse

### 5. Scaling

- Use PM2 for multi-process: `npm install -g pm2 && pm2 start server.js -i max`
- Enable compression: `app.use(require('compression')())`
- Add CDN if serving static assets

## Update Extension

After deploying, update your Chrome extension:

**manifest.json:**

```json
"host_permissions": [
  "https://your-deployed-url.com/*"
]
```

**background.js:**

```javascript
const response = await fetch("https://your-deployed-url.com/translate", {
  // ...
});
```

## Troubleshooting

### Error: API key not found

- Check `.env` file exists and has `GOOGLE_API_KEY`
- Verify API key is valid at https://makersuite.google.com/app/apikey

### Error: Too many requests

- Rate limit hit (60/min per IP by default)
- Wait 1 minute or increase `RATE_LIMIT_MAX_REQUESTS`

### Error: CORS

- Add your origin to `ALLOWED_ORIGINS` in `.env`
- Use comma-separated list for multiple origins

### Cache not working

- Verify server restart didn't clear cache (use Redis for persistence)
- Check cache TTL hasn't expired (default 72h)

### Slow translations

- First request is slow (Gemini API call)
- Cached requests are instant (<10ms)
- Consider using `gemini-1.5-flash` for speed

## Cost Estimation

**Gemini 1.5 Flash** (as of Oct 2024):

- Free tier: 15 requests/minute
- Paid: $0.00025 per 1K characters input, $0.00075 per 1K characters output

**Example:** 10,000 translations/month (avg 100 chars each):

- Input: 1M chars = $0.25
- Output: 1M chars = $0.75
- **Total: ~$1/month** (plus hosting)

Cache can reduce this significantly (30-60% hit rate typical).

## Environment Variables Reference

| Variable                  | Required | Default          | Description             |
| ------------------------- | -------- | ---------------- | ----------------------- |
| `GOOGLE_API_KEY`          | Yes      | -                | Gemini API key          |
| `PORT`                    | No       | 3000             | Server port             |
| `GEMINI_MODEL`            | No       | gemini-1.5-flash | Model name              |
| `CACHE_TTL_HOURS`         | No       | 72               | Cache expiration        |
| `RATE_LIMIT_WINDOW_MS`    | No       | 60000            | Rate limit window       |
| `RATE_LIMIT_MAX_REQUESTS` | No       | 60               | Max requests per window |
| `ALLOWED_ORIGINS`         | No       | \*               | CORS allowed origins    |
| `NODE_ENV`                | No       | development      | Environment mode        |

## License

MIT

## Support

For issues:

1. Check server logs
2. Test with `/health` endpoint
3. Run `npm test` to verify functionality
4. Check Gemini API status
