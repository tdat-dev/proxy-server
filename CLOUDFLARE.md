# Cloudflare Workers Deployment Guide

Complete guide for deploying the translation proxy to Cloudflare Workers with KV storage.

## Prerequisites

- Cloudflare account (free tier works)
- Node.js 18+ installed
- Wrangler CLI installed

## Setup Steps

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

This opens a browser to authenticate.

### 3. Create KV Namespace

```bash
wrangler kv:namespace create "TRANSLATION_CACHE"
```

Note the ID from the output (e.g., `abc123def456`).

### 4. Update wrangler.toml

Edit `wrangler.toml` and replace `your-kv-namespace-id` with the actual ID:

```toml
kv_namespaces = [
  { binding = "TRANSLATION_CACHE", id = "abc123def456" }
]
```

### 5. Set API Key Secret

```bash
wrangler secret put GOOGLE_API_KEY
```

Paste your Gemini API key when prompted.

### 6. Configure CORS (Optional)

Update `wrangler.toml` to restrict origins:

```toml
[vars]
ALLOWED_ORIGINS = "chrome-extension://your-extension-id"
```

Or keep `"*"` for development.

### 7. Deploy

```bash
wrangler deploy
```

Output shows your worker URL:

```
Published translation-proxy-worker
  https://translation-proxy-worker.your-account.workers.dev
```

## Usage

### Test the deployed worker

```bash
curl -X POST https://translation-proxy-worker.your-account.workers.dev/translate \
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

### Health check

```bash
curl https://translation-proxy-worker.your-account.workers.dev/health
```

## Update Chrome Extension

After deployment, update your extension with the worker URL:

**manifest.json:**

```json
"host_permissions": [
  "https://translation-proxy-worker.your-account.workers.dev/*"
]
```

**background.js:**

```javascript
const response = await fetch(
  "https://translation-proxy-worker.your-account.workers.dev/translate",
  {
    // ...
  }
);
```

## KV Cache Management

### View cache entries

```bash
wrangler kv:key list --namespace-id=abc123def456
```

### Get specific entry

```bash
wrangler kv:key get "cache-key-hash" --namespace-id=abc123def456
```

### Clear entire cache

```bash
wrangler kv:key list --namespace-id=abc123def456 | \
  jq -r '.[].name' | \
  xargs -I {} wrangler kv:key delete {} --namespace-id=abc123def456
```

## Environment Variables

Set via `wrangler.toml` or Cloudflare dashboard:

| Variable          | Type     | Description                            |
| ----------------- | -------- | -------------------------------------- |
| `GOOGLE_API_KEY`  | Secret   | Gemini API key (use wrangler secret)   |
| `GEMINI_MODEL`    | Variable | Model name (default: gemini-1.5-flash) |
| `ALLOWED_ORIGINS` | Variable | CORS allowed origins                   |

### Set additional secrets

```bash
wrangler secret put SECRET_NAME
```

### Update variables

Edit `wrangler.toml` and redeploy, or use dashboard.

## Monitoring

### View logs (real-time)

```bash
wrangler tail
```

### View logs (dashboard)

Go to Cloudflare dashboard → Workers → your-worker → Logs

### Analytics

Dashboard → Workers → your-worker → Analytics shows:

- Requests per day
- Errors
- CPU time
- KV operations

## Cost Estimation

**Cloudflare Workers Free Tier:**

- 100,000 requests/day
- 10ms CPU time per request
- Unlimited KV reads
- 1,000 KV writes/day

**Paid Plan ($5/month):**

- 10M requests/month
- No CPU time limit
- Unlimited KV operations

**Gemini API:** Same as Express version (~$1/month for 10K translations).

**Typical usage:** Free tier is sufficient for personal use or small teams.

## Custom Domain (Optional)

### 1. Add route in wrangler.toml

```toml
routes = [
  { pattern = "translate.your-domain.com/*", zone_name = "your-domain.com" }
]
```

### 2. Deploy

```bash
wrangler deploy
```

### 3. Verify DNS

Cloudflare automatically configures DNS. Verify at:
Dashboard → DNS → your-domain.com

## Troubleshooting

### Error: KV namespace not found

- Verify namespace ID in `wrangler.toml`
- Create namespace: `wrangler kv:namespace create "TRANSLATION_CACHE"`

### Error: API key not set

- Run: `wrangler secret put GOOGLE_API_KEY`
- Verify in dashboard: Workers → Settings → Variables

### Error: CORS

- Update `ALLOWED_ORIGINS` in `wrangler.toml`
- Redeploy: `wrangler deploy`

### Worker not updating

- Clear local cache: `wrangler dev --local` then `wrangler deploy`
- Check deployed version: `wrangler deployments list`

### High CPU time

- Check logs for slow operations
- Consider using `gemini-1.5-flash` instead of `pro`
- Optimize cache key generation

## Development

### Local development

```bash
wrangler dev
```

Worker runs at `http://localhost:8787`

Test locally:

```bash
curl -X POST http://localhost:8787/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","targetLang":"vi","provider":"gemini"}'
```

### Local KV storage

Wrangler uses local storage in dev mode. No KV namespace needed.

## Production Checklist

- [ ] Set `GOOGLE_API_KEY` secret
- [ ] Update KV namespace ID in wrangler.toml
- [ ] Configure `ALLOWED_ORIGINS` (no wildcards)
- [ ] Deploy: `wrangler deploy`
- [ ] Test with curl/Postman
- [ ] Update extension manifest with worker URL
- [ ] Monitor logs: `wrangler tail`
- [ ] Check analytics in dashboard

## Comparison: Workers vs Express

| Feature    | Workers           | Express           |
| ---------- | ----------------- | ----------------- |
| Cold start | ~5-10ms           | ~500ms            |
| Scaling    | Automatic         | Manual            |
| Cache      | KV (persistent)   | Memory (volatile) |
| Cost       | Free tier OK      | Hosting required  |
| Deployment | `wrangler deploy` | Platform-specific |
| Rate limit | Per-worker        | Per-instance      |
| Logs       | Dashboard/tail    | Server logs       |
| Best for   | Edge/global       | VPS/dedicated     |

## Next Steps

1. Deploy worker: `wrangler deploy`
2. Get worker URL from output
3. Update extension with URL
4. Test translation in extension
5. Monitor usage in dashboard

## Support

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Wrangler docs: https://developers.cloudflare.com/workers/wrangler/
- KV docs: https://developers.cloudflare.com/workers/runtime-apis/kv/

## License

MIT
