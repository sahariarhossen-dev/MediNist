## Plan: Switch checkout to live UddoktaPay panel + relabel pay button

The checkout already has a working pay button wired to the `create-uddoktapay-checkout` edge function. The request is to (a) make sure the call hits the **live** UddoktaPay panel URL with the exact header and payload format you specified, (b) make the button visually prominent with the new label, and (c) keep the existing error toast contract.

### 1. Edge function `create-uddoktapay-checkout` updates

- Default `UDDOKTAPAY_BASE_URL` to `https://panel.uddoktapay.com` (was sandbox). Still overridable via secret.
- Send the API key under the header **`Api-Key`** (per your spec) in addition to `RT-UDDOKTAPAY-API-KEY` so it works whether your account expects either name.
- Build the request body exactly as:
  ```json
  {
    "full_name": "<profile.full_name>",
    "email": "<auth user email>",
    "amount": "2000",
    "metadata": {
      "order_id": "sub_<timestamp>",
      "user_id": "<uid>",
      "pharmacy_id": "<pid>",
      "days": "30"
    },
    "redirect_url": "<app_url>/subscription/payment-return",
    "cancel_url": "<app_url>/subscription?cancelled=1",
    "webhook_url": "<functions>/uddoktapay-webhook",
    "return_type": "GET"
  }
  ```
- Keep `pharmacy_id` and `days` in metadata so the verify/webhook flow can still extend the subscription by exactly 30 days (don't break existing logic).
- Log the upstream response on failure for easier debugging.

### 2. `SubscriptionCheckout.tsx` UI tweaks

- Add a **non-sticky, in-flow** "Confirm & Pay ৳2,000" button right below the PAYMENT info card (in addition to keeping the sticky bottom CTA so the layout still feels like the screenshot on small screens). Both buttons call the same `handlePay`.
- Button styling: full width, `h-14`, emerald primary, rounded-2xl, bold, with a lock/shield icon.
- On error from `supabase.functions.invoke(...)`, show toast: **"Could not connect to payment gateway. Please try again."** (replaces current generic message).
- On success, `window.location.href = payment_url` (already implemented).

### 3. No DB changes
Schema and verify/webhook flow stay as-is — the 30-day extension on success already works via `uddoktapay-verify` + `_shared/uddoktapay.ts`.

### Files to edit
- `supabase/functions/create-uddoktapay-checkout/index.ts`
- `src/pages/SubscriptionCheckout.tsx`

### Note on the API key
The key `SKJDSE48iWwNgW2togoKtWvAQ5Hnivxphy3Vb6m7` is already stored as the `UDDOKTAPAY_API_KEY` secret — we will keep using the secret rather than hardcoding it in the frontend (hardcoding a private key in client code would let anyone drain your gateway). Since you've now shared it in chat, please rotate it in the UddoktaPay dashboard and we'll update the secret.
