# Fix invitation token verification on medinist.com

## Root cause

`src/pages/AcceptInvitation.tsx` calls the `accept-invitation` edge function in two ways:

1. `supabase.functions.invoke("accept-invitation", { method: "GET" })` — supabase-js doesn't actually support GET with query params, so this sends a POST with no body. The edge function's POST branch then fails token validation and returns an error.
2. A fallback `fetch()` that builds the URL from `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`.

The `.env` file in this repo is **local-only** and is not committed/available on Vercel. On the production build served from `medinist.com`, those `VITE_*` env vars are `undefined`, so the fallback URL becomes `undefined/functions/v1/accept-invitation?token=...` → browser throws **"Failed to fetch"** → UI shows **"Invitation not found"**.

The hardcoded `src/integrations/supabase/client.ts` works fine because the URL/key are baked into the file, but `AcceptInvitation.tsx` bypasses that and reads `import.meta.env` directly.

The edge function itself, the database RPC, the token, and CORS are all fine — this is purely a frontend URL-construction bug that surfaces only in the Vercel production build.

## Changes

### 1. `src/integrations/supabase/client.ts`
Export the URL and anon key constants so other files can reuse them without depending on `import.meta.env`:

```ts
export const SUPABASE_URL = "https://hjqcvidezzzkfipcneit.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOi...";
```

### 2. `src/pages/AcceptInvitation.tsx`
- Import `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the client module.
- Drop the broken `supabase.functions.invoke(..., { method: "GET" })` call entirely.
- For the GET (load invitation), use a direct `fetch` to `${SUPABASE_URL}/functions/v1/accept-invitation?token=...` with the `apikey` and `Authorization: Bearer <anon>` headers.
- Keep using `supabase.functions.invoke()` for the POST (accept) — that one works correctly.

### 3. Verification
After the fix:
- Direct-load `https://medinist.com/accept-invitation?token=<valid-token>` should show the pharmacy/role/email card.
- Submitting name + password should create the account, sign in, and redirect to `/`.
- Expired/accepted/revoked tokens should still show their respective error states.

## Out of scope
- No edge function changes (it's already correct).
- No Supabase config or RLS changes.
- No changes to the email link, `APP_URL`, or `invite-staff` function — those are correct.
