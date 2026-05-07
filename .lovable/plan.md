## Plan: UddoktaPay (Paymently) Integration for Subscription Renewal

Replace the current mock checkout flow with a real UddoktaPay hosted checkout. Payment confirmation is verified server-side via UddoktaPay's verify API, then `extend_subscription` RPC adds 30 days.

### 1. Store API key as a secret (not in code)
The provided key `SKJDSE48iWwNgW2togoKtWvAQ5Hnivxphy3Vb6m7` is a **private API key** — it must never live in frontend code. Save it as a Supabase secret: `UDDOKTAPAY_API_KEY`. Also save `UDDOKTAPAY_BASE_URL` (default `https://sandbox.uddoktapay.com` or live host — confirm with user).

### 2. New edge function: `create-uddoktapay-checkout`
- Auth-required (validates JWT, gets user + pharmacy).
- Calls `POST {BASE}/api/checkout-v2` with header `RT-UDDOKTAPAY-API-KEY` and body:
  ```json
  {
    "full_name": "<user full_name>",
    "email": "<user email>",
    "amount": "2000",
    "metadata": { "user_id": "<uid>", "pharmacy_id": "<pid>", "days": 30 },
    "redirect_url": "<APP_URL>/subscription/payment-return",
    "cancel_url": "<APP_URL>/subscription?cancelled=1",
    "webhook_url": "<SUPABASE_FUNCTIONS_URL>/uddoktapay-webhook",
    "return_type": "GET"
  }
  ```
- Returns `{ payment_url, invoice_id }` to the client.

### 3. New edge function: `uddoktapay-verify`
- Public (no JWT) — called by the return page with `?invoice_id=...`.
- Calls `POST {BASE}/api/verify-payment` with the API key header and `{ invoice_id }`.
- If response `status === "COMPLETED"`, uses the service role client to:
  - Read `metadata.user_id`, `metadata.pharmacy_id`, `metadata.days` (30), amount.
  - Idempotency: check `subscription_payments` for an existing row with this `invoice_id` (new column). If exists, return success without re-extending.
  - Otherwise call `extend_subscription` logic equivalent **as service role for that pharmacy** (the existing RPC uses `auth.uid()`, so we will instead perform the update + insert directly in the function using service role, mirroring the RPC: `subscription_expiry = GREATEST(current, now()) + 30 days`, insert `subscription_payments` row with `provider='uddoktapay'`, `invoice_id`, `status='success'`).
- Returns `{ ok: true, new_expiry }`.

### 4. New edge function: `uddoktapay-webhook`
- Public endpoint UddoktaPay POSTs to on payment events.
- Verifies sender by re-calling `verify-payment` with the received `invoice_id` (don't trust webhook body alone).
- Same idempotent extension logic as the verify function (shared helper).
- Returns 200.

### 5. Database migration
Add columns to `subscription_payments`:
- `provider text default 'manual'`
- `invoice_id text` with `unique` index for idempotency
- `metadata jsonb`

No change to `extend_subscription` RPC (kept for admin-only manual flows). The webhook/verify path performs the extension directly with service role to support post-redirect confirmation.

### 6. Frontend changes
- **`SubscriptionCheckout.tsx`**: Remove mock gateway list + mock RPC call. Replace "Pay" button with: on click → `supabase.functions.invoke('create-uddoktapay-checkout')` → `window.location.href = payment_url`. Keep order summary + loading state. (Optionally remove the gateway picker since UddoktaPay's own page lets the user pick bKash/Nagad/Rocket/Card.)
- **New page `/subscription/payment-return`** (`SubscriptionPaymentReturn.tsx`): On mount reads `?invoice_id` from URL, calls `supabase.functions.invoke('uddoktapay-verify', { body: { invoice_id } })`, shows spinner → on success fires confetti + toast "Subscription Extended Successfully!" and navigates to `/subscription`. On failure shows error + retry/back buttons.
- **`Subscription.tsx`**: If URL has `?cancelled=1`, show info toast "Payment cancelled". The existing realtime `useSubscription` hook will pick up the new expiry instantly once the DB row updates.
- **`App.tsx`**: Add `/subscription/payment-return` route (protected).

### 7. Renewal modal flow stays the same
"Renew Subscription" dialog → "Proceed to Checkout" → `/subscription/checkout` → user clicks pay → redirect to UddoktaPay hosted page → UddoktaPay redirects back to `/subscription/payment-return?invoice_id=...` → verify → toast + redirect to `/subscription` with updated timer.

### Open questions / assumptions
- **Sandbox vs live**: Will default to UddoktaPay **sandbox** (`https://sandbox.uddoktapay.com`) unless the user confirms this key is for production. The base URL is configurable via the `UDDOKTAPAY_BASE_URL` secret.
- **Security note**: The API key you shared is now in our chat — please rotate it in your UddoktaPay dashboard once integration is done, and we'll store the new one as a secret only.

### Files
- New edge functions: `supabase/functions/create-uddoktapay-checkout/index.ts`, `supabase/functions/uddoktapay-verify/index.ts`, `supabase/functions/uddoktapay-webhook/index.ts`
- New page: `src/pages/SubscriptionPaymentReturn.tsx`
- Edit: `src/pages/SubscriptionCheckout.tsx`, `src/pages/Subscription.tsx`, `src/App.tsx`
- Migration: add `provider`, `invoice_id` (unique), `metadata` to `subscription_payments`
- Secrets: `UDDOKTAPAY_API_KEY`, `UDDOKTAPAY_BASE_URL`
