## Root cause

The edge function logs show a clean 400 response for Mamun's invite attempt (pharmacy `77765d52…`), and no row was written to `shop_staff`. His profile is correctly `role='admin'` with `pharmacy_id` set, and the `shop_staff` CHECK constraint accepts `salesman`/`manager` — so the security check and DB constraints are NOT blocking him.

The 400 is the edge function's own `"Invalid email address"` validation firing. The value typed into the email field ("sijan", no `@`) fails the regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`, so the function returns `{ error: "Invalid email address" }` with status 400.

The real bug is on the **client**: `supabase.functions.invoke` returns a `FunctionsHttpError` for any non-2xx response and leaves `data` as `null`. The current handler in `ShopProfile.tsx` does `data?.error || error?.message`, so the helpful server message is discarded and the user only sees the generic `"Edge Function returned a non-2xx status code"`.

Two smaller, related gaps:
- The invite form does not validate the email client-side, so users can submit `"sijan"` and only learn it's wrong via a confusing toast.
- `invite-staff` logs nothing on the `Invalid email` / `Invalid role` paths, making this exact bug hard to diagnose from logs.

## Fix plan

**1. `src/pages/ShopProfile.tsx` — surface the real error and pre-validate**
- Add a small `EMAIL_RE` and reject obviously-invalid emails before calling the function, with a clear toast (e.g. "Enter a valid email address like name@example.com").
- Replace the `data?.error || error?.message` pattern in both `handleInvite` and `handleResendInvite` with a helper that:
  - Reads the JSON body from `error.context` (the `Response` object Supabase attaches to `FunctionsHttpError`) and uses its `error` field when present.
  - Falls back to `error.message` only when the body can't be parsed.
- Show the actual reason ("Invalid email address", "Invalid role", "Only admins can invite staff", etc.) in the toast description.

**2. `supabase/functions/invite-staff/index.ts` — better diagnostics**
- Add `console.error("Invalid email payload:", rawEmail)` and `console.error("Invalid role payload:", role)` on the validation 400 branches so future failures are visible in logs.
- Keep the existing `console.error("Upsert error:", upsertError.message)` and the outer `try/catch` (already present and correct).
- No behavioural / contract changes; the role allow-list (`owner`, `manager`, `salesman`) stays in sync with what the client actually sends (`salesman`, `manager`). The `owner` entry is unused but harmless and is intentionally left alone to avoid scope creep — flag this in a follow-up only if you want it cleaned up.

**3. Explicitly out of scope (verified, no change needed)**
- New shop owner relation: Mamun's profile already has `role='admin'` + `pharmacy_id`, and `is_pharmacy_admin()` would return true. No `shop_staff` "owner" seed row is required — admin status lives on `profiles`.
- `shop_id` payload: the client does not send any shop id; the edge function derives `pharmacy_id` from the caller's profile, so there is no cached/stale id path to fix.
- `shop_staff` CHECK constraint / RLS: unchanged. Roles and policies already match the data flow.

## Verification

After applying:
1. With Mamun signed in, type `sijan` and click Send → toast should now say **"Invalid email address"** instead of the generic non-2xx message.
2. Type `sijan@example.com` → invite succeeds and the share-link dialog opens; a `pending` row appears in `shop_staff` for pharmacy `77765d52…`.
3. Re-check `invite-staff` edge logs — validation failures now print the offending payload.
