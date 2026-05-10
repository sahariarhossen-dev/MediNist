## Scope

The codebase already uses dynamic URLs in most places (`window.location.origin` for Supabase auth redirects, relative React Router links, `supabase` client pointing at the Supabase project URL — not the app domain). So this is mostly a metadata + edge function default update, plus configuration that must happen outside code.

## Code changes

1. **`index.html`** — add canonical + og:url, ensure title/description reflect MediNist:
   - Add `<link rel="canonical" href="https://medinist.com/" />`
   - Add `<meta property="og:url" content="https://medinist.com/" />`
   - Add `<meta property="og:site_name" content="MediNist" />`
   - Keep existing title `MediNist` and description.
   - Leave the existing `og:image` (Lovable storage CDN URL) as-is — it's a CDN asset, not a site URL.

2. **`public/manifest.json`** — add `"id": "/"` and `"start_url": "/"` is already correct. Add `"scope": "/"` (already present). No domain hardcoded here, so no change needed beyond confirming `name`/`short_name` = "MediNist" (already correct).

3. **`supabase/functions/invite-staff/index.ts`** — change the default `APP_URL` fallback from `https://medi-nist.lovable.app` to `https://medinist.com`. Also recommend setting the `APP_URL` secret in Supabase to `https://medinist.com` so invite emails always link there.

4. **No changes needed** in:
   - `src/integrations/supabase/client.ts` — points at the Supabase project URL, not the app domain. Correct as-is.
   - `src/pages/ForgotPassword.tsx` and any other auth flows — already use `window.location.origin`, so they automatically use whichever domain the user is on.
   - React Router links — all relative.

## Configuration to do outside code (cannot be done from this repo)

These are required for the new domain to fully work in production. They will be listed in the final message for the user to action:

- **Supabase Auth → URL Configuration**: set Site URL to `https://medinist.com` and add `https://medinist.com/**` (and the reset-password path) to the Redirect URLs allowlist. Otherwise password reset / magic links will fail.
- **Supabase → Edge Function secrets**: set `APP_URL = https://medinist.com` for the `invite-staff` function.
- **Supabase Auth email templates**: if any reference the old domain, update them.

## Out of scope

- No business logic changes.
- No UI/style changes.
- No new SEO components — current setup uses static tags in `index.html`, which is sufficient for this single-app shell.
