# cs2.sh Chat Worker

Cloudflare Worker that proxies chat requests to Gemini, injecting the full `llms-full.txt` as system context.

## Setup

```bash
npm install -g wrangler
wrangler login
```

## Create KV Namespace

```bash
wrangler kv namespace create KV
```

Copy the printed `id` into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "<paste-id-here>"
```

## Set Gemini API Key

Get a free key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
wrangler secret put GEMINI_API_KEY
```

## Deploy

```bash
wrangler deploy
```

Note the worker URL (e.g. `https://cs2sh-chat.YOUR_SUBDOMAIN.workers.dev`).

Update the `WORKER_URL` constant in `content/gemini-chat.js` to match.

## Endpoint

```
POST /v1/chat/completions
Content-Type: application/json

{
  "messages": [{"role": "user", "content": "How do I authenticate?"}],
  "stream": true
}
```

## Limits

- 1,000 requests/day (Gemini free tier)
- CORS locked to `https://cs2.sh` and `*.mintlify.app`
- `llms-full.txt` cached in KV for 1 hour
