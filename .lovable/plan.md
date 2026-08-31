# Fix ai-chat 500 crash

## What the logs show

The 500 is not a Gemini or prompt problem. Edge function logs contain:

```text
ERROR ai-chat fatal: supabase.auth.getClaims is not a function
```

The function imports the Supabase client from `https://esm.sh/@supabase/supabase-js@2.45.0`, which bundles `auth-js@2.64.4`. That version has no `getClaims()` method, so the auth check added to work around the earlier `session_not_found` 401 throws immediately and the handler falls into the generic "An internal error occurred" 500 response.

Before this change, the same requests failed with a 401 because `getUser()` rejects tokens whose auth session row no longer exists (`code: session_not_found`) — so simply reverting is not enough.

## Fix

1. Upgrade the client import in `supabase/functions/ai-chat/index.ts` to a modern pinned version via an `npm:` specifier (`npm:@supabase/supabase-js@2`), which ships `auth.getClaims()`.
2. Keep the auth flow as: try `getClaims(token)` first (verifies the JWT signature without needing the session row), fall back to `getUser(token)` only when `getClaims` is unavailable or returns no `sub`.
3. Guard the call so a missing method can never crash the handler: check `typeof supabase.auth.getClaims === "function"` before calling it, and wrap the verification block in try/catch so any auth failure returns a clean 401 instead of a 500.
4. Keep logging the auth failure reason (already present) so future auth issues are traceable.

## Verification

- Redeploy `ai-chat`.
- Run the existing function tests.
- Re-check edge function logs for a request that reaches the "authenticated request" log line and returns 200, with no `fatal:` entries.

## Technical notes

- `getClaims()` performs local JWT verification against the project's signing keys, which is why it tolerates a deleted session row while still being secure.
- `npm:` specifiers are preferred over `esm.sh` in the edge runtime for version stability.
- No client-side changes are needed; the session-refresh-and-retry logic in `src/pages/AIAssistant.tsx` stays as is.
