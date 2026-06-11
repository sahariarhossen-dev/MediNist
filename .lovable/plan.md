
## Problem

`src/integrations/supabase/client.ts` initializes the Supabase client with `import.meta.env.VITE_SUPABASE_URL`. In `.env`, that variable is currently:

```
VITE_SUPABASE_URL="https://hjqcvidezzzkfipcneit.supabase.co"
```

So the app is talking directly to Supabase, not to the `api.medinist.com` Vercel proxy. The proxy's "Valid Configuration" is never being used by the frontend, and the "Invalid login credentials" error is coming back from Supabase itself — meaning the email/password combination is wrong (or the user doesn't exist / isn't confirmed).

The anon key is fine — `VITE_SUPABASE_PUBLISHABLE_KEY` matches `SUPABASE_PUBLISHABLE_KEY` exactly, and the client passes it through unchanged.

## Changes

### 1. Update `.env`

Change the frontend-visible URL to the proxy so the browser actually routes auth/REST traffic through `api.medinist.com`:

```
VITE_SUPABASE_URL="https://api.medinist.com"
```

Leave `VITE_SUPABASE_PROJECT_ID` and both publishable keys untouched.

### 2. Leave `src/integrations/supabase/client.ts` as-is

It already does the right thing:

```ts
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://api.medinist.com";
```

With the `.env` change above, both the env value and the fallback point at the proxy. The anon key is passed straight into `createClient` with no transformation.

### 3. Verify after the change

Once the dev server picks up the new env value, in the browser DevTools Network tab the login request should go to:

```
POST https://api.medinist.com/auth/v1/token?grant_type=password
```

with headers `apikey: <anon key>` and `Content-Type: application/json`.

- If that request returns **200** with a session: proxy + client are fully working.
- If it still returns **400 "Invalid login credentials"** from `api.medinist.com`: the proxy is working correctly and the problem is the actual account credentials. Reset the password from `/forgot-password`, or confirm the user exists in Supabase Auth → Users.
- If it returns **401 / CORS / network error**: the proxy is misconfigured (e.g. stripping `apikey` or a SPA fallback rewrite is catching `/auth/v1/*`).

## Notes

- No code in `src/` needs editing; only `.env`.
- After saving `.env`, the Vite dev server will reload and pick up the new value automatically.
- The Supabase email confirmation redirect URL in the Supabase dashboard should also include `https://medinist.com` and your preview URL so confirmation links return users to the right place — unrelated to this bug but worth checking while you're in there.
