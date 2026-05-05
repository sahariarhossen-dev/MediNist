## Plan

The current `UDDOKTAPAY_BASE_URL` secret is set to `https://panel.paymently.io`, which returns an "Access Denied - Paymently" HTML page (upstream status 200 with HTML body) — meaning that host is not your merchant gateway.

You've asked to switch it to `https://medinist.paymently.io` and retest using the existing API key.

### Steps

1. **Update the `UDDOKTAPAY_BASE_URL` secret**
   - Set value to: `https://medinist.paymently.io` (no trailing slash, no `/api`).
   - The edge function already strips `/api` and trailing slashes defensively, but we want the secret clean.

2. **Confirm `UDDOKTAPAY_API_KEY` secret**
   - Keep the existing value `SKJDSE48iWwNgW2togoKtWvAQ5Hnivxphy3Vb6m7` (already stored). No change needed unless you want to rotate.
   - Note: since this key has been shared in chat, you should rotate it in the Paymently/UddoktaPay dashboard afterwards for security.

3. **Test the edge function**
   - After the secret is updated, call `create-uddoktapay-checkout` via `supabase--curl_edge_functions` with a small payload (`days: 30`, `amount: 2000`, `app_url`) to verify it now returns a real `payment_url` instead of the 502 + HTML access-denied response.
   - Inspect logs if it still fails and surface the upstream body so we can diagnose (e.g., wrong subdomain, IP allowlist, or wrong API key header name).

4. **No code changes required**
   - `supabase/functions/create-uddoktapay-checkout/index.ts` already:
     - sends both `RT-UDDOKTAPAY-API-KEY` and `Api-Key` headers,
     - normalizes the base URL,
     - posts to `/api/checkout-v2`,
     - surfaces upstream status/body on failure.
   - `src/pages/SubscriptionCheckout.tsx` already invokes the function and redirects on success.

### If the test still fails

Likely causes and what we'll do:
- **Wrong subdomain** — confirm in your Paymently/UddoktaPay merchant dashboard the exact "API Base URL". Update secret accordingly.
- **API key invalid/expired** — rotate in dashboard, update `UDDOKTAPAY_API_KEY` secret.
- **Different header name expected** — adjust headers in the edge function based on the upstream error body (which we'll log).

### Security note
Please rotate the API key in your Paymently dashboard since it was shared in plain text — then I'll update the `UDDOKTAPAY_API_KEY` secret with the new value.