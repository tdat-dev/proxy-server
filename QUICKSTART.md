# Translation Proxy Server - Quick Start

Choose your deployment option and get running in minutes.

## 🚀 Option 1: Express (Node.js)

Best for: VPS, dedicated servers, or platforms like Vercel/Render/Fly.

### Setup

```bash
cd proxy-server
npm install
cp .env.example .env
# Edit .env with your Gemini API key
npm start
```

Server runs at `http://localhost:3000`

### Deploy to Vercel (Easiest)

```bash
npm install -g vercel
vercel
# Follow prompts, set GOOGLE_API_KEY when asked
```

### Deploy to Render

1. Push to GitHub
2. Go to https://render.com
3. New → Web Service
4. Connect your repo
5. Set environment variables in dashboard
6. Deploy

### Deploy to Fly.io

```bash
fly launch
fly secrets set GOOGLE_API_KEY=your_key
fly deploy
```

---

## ☁️ Option 2: Cloudflare Workers

Best for: Edge deployment, global distribution, serverless.

### Setup

```bash
npm install -g wrangler
wrangler login
wrangler kv:namespace create "TRANSLATION_CACHE"
# Note the namespace ID
```

Edit `wrangler.toml` with your namespace ID.

### Deploy

```bash
wrangler secret put GOOGLE_API_KEY
# Paste your API key
wrangler deploy
```

Worker URL: `https://translation-proxy-worker.your-account.workers.dev`

See `CLOUDFLARE.md` for detailed instructions.

---

## 🧪 Test Your Deployment

```bash
curl -X POST YOUR_DEPLOYMENT_URL/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "sourceLang": "en",
    "targetLang": "vi",
    "provider": "gemini"
  }'
```

Expected:

```json
{
  "translation": "Xin chào thế giới",
  "cached": false,
  "detectedSourceLang": "en"
}
```

---

## 🔧 Update Extension

After deployment, update your Chrome extension:

**1. Update manifest.json:**

```json
"host_permissions": [
  "https://YOUR_DEPLOYMENT_URL/*"
]
```

**2. Update background.js** (line ~59):

```javascript
const response = await fetch('https://YOUR_DEPLOYMENT_URL/translate', {
```

**3. Reload extension** in `chrome://extensions/`

---

## 📊 Quick Comparison

| Feature    | Express            | Workers         |
| ---------- | ------------------ | --------------- |
| Setup time | 5 min              | 10 min          |
| Free tier  | Platform-dependent | 100K req/day    |
| Cold start | ~500ms             | ~10ms           |
| Cache      | Memory (volatile)  | KV (persistent) |
| Best for   | VPS/dedicated      | Edge/serverless |

---

## 💡 Pro Tips

1. **Start with Express** if you're new to deployment
2. **Use Workers** for production/global users
3. **Test locally first** before deploying
4. **Monitor usage** to stay in free tier
5. **Set CORS properly** in production (no wildcards)

---

## 🆘 Need Help?

- **Express:** See `README.md`
- **Workers:** See `CLOUDFLARE.md`
- **Testing:** Run `npm test`
- **Issues:** Check server logs or `wrangler tail`

---

## 🎯 Next Steps

1. Choose deployment option
2. Deploy server
3. Test with curl
4. Update extension URLs
5. Test translation in extension
6. You're done! 🎉
