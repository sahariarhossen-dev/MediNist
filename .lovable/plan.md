## Goal

Provide a correct `vercel.json` for the repo hosting `api.medinist.com` so it transparently proxies all Supabase traffic (REST, Auth, Realtime, Storage, Functions) to `https://hjqcvidezzzkfipcneit.supabase.co` while preserving headers, paths, query strings, and cookies.

## How Vercel rewrites actually behave (important)

Vercel `rewrites` to an absolute external URL act as a reverse proxy and **forward all request headers as-is by default**, including `apikey`, `Authorization`, `Content-Type`, `x-client-info`, and the request body. Response headers (including `Set-Cookie`) are also passed through unchanged. You do **not** need to enumerate headers — enumerating them with `headers` only *adds/overrides* headers on the response and can actually break Auth if misused.

The two things that usually break Supabase Auth through a Vercel proxy are:
1. The rewrite source not matching sub-paths like `/auth/v1/token?grant_type=password` (missing wildcard or capturing only no-dot paths).
2. Mixing a SPA fallback rewrite (`/((?!.*\\.).*) -> /index.html`) into the same project, so `/auth/v1/...` gets rewritten to `index.html` instead of Supabase.

The cleanest fix: **host the proxy on its own Vercel project** (separate repo/project) that *only* contains a `vercel.json`. Do not combine it with the SPA project.

## Deliverable: `vercel.json` for the proxy project

```json
{
  "rewrites": [
    {
      "source": "/:path*",
      "destination": "https://hjqcvidezzzkfipcneit.supabase.co/:path*"
    }
  ]
}
```

That is the entire file. Notes:

- `/:path*` matches every path segment including `/auth/v1/token`, `/rest/v1/...`, `/realtime/v1/...`, `/storage/v1/...`, `/functions/v1/...`.
- Query strings are forwarded automatically.
- Request headers (`apikey`, `Authorization`, `Content-Type`, `x-client-info`, `Accept`, `Range`, etc.) are forwarded automatically.
- Response headers including `Set-Cookie` are forwarded automatically.
- No `headers` block is needed; adding one risks overwriting CORS headers Supabase already sets.

## Things to verify on the Vercel side

1. The proxy lives in a **separate Vercel project** from the SPA (or at minimum, this project has no `/index.html` fallback rewrite). The current SPA `vercel.json` in this repo (`{ "source": "/((?!.*\\.).*)", "destination": "/index.html" }`) must NOT be in the proxy project.
2. In the proxy project's Vercel Dashboard → Settings → Domains, `api.medinist.com` is attached.
3. No Vercel "Deployment Protection" / password protection is enabled on the proxy project (it would inject an auth wall and break API calls, especially in Incognito).
4. No edge middleware (`middleware.ts`) exists in the proxy project — it would intercept and likely strip auth.
5. WebSockets (Realtime) work over Vercel rewrites; nothing extra to configure.

## Quick test commands (after deploying the proxy)

```bash
# Anonymous REST ping — should return [] or row data, not 401 from proxy
curl -i "https://api.medinist.com/rest/v1/" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"

# Auth password grant — should return access_token JSON, not "Invalid login credentials"
curl -i "https://api.medinist.com/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<password>"}'
```

If the direct Supabase URL works with the same payload but `api.medinist.com` returns 400/401, the issue is in the proxy project configuration (most commonly: SPA fallback present, deployment protection on, or middleware running) — not in this codebase.

## No changes required in this repo

`src/integrations/supabase/client.ts`, `.env`, and the cron migration already point to `https://api.medinist.com`. Once the proxy `vercel.json` above is deployed on the proxy project, login will work in normal and Incognito browsing.
