## One-time manual override for "Fahim Madical Hall"

Target pharmacy: `Fahim Madical Hall` — id `5dd79692-90ea-4a7f-a059-bd2980a74cbf`. Current `subscription_expiry` is `NULL` (expired/free tier).

No UI, component, route, or frontend code will be touched. The existing lockout overlay reads `pharmacies.subscription_expiry` — once that column is extended, the overlay lifts automatically for this shop. No per-shop frontend bypass is needed (and adding one would be a security smell).

### Data changes (one SQL transaction, via the insert tool)

1. **Extend access by 30 days from today** on `public.pharmacies`:
   - Set `subscription_expiry = now() + interval '30 days'`
   - Set `subscription_started_at = COALESCE(subscription_started_at, now())`
   - Scoped to `id = '5dd79692-90ea-4a7f-a059-bd2980a74cbf'`

2. **Log the offline payment** into `public.subscription_payments`:
   - `pharmacy_id` = the id above
   - `user_id` = the pharmacy's admin profile (looked up from `profiles` where `pharmacy_id` matches and `role = 'admin'`, fallback to any profile in that pharmacy if no admin row exists)
   - `amount_bdt` = `500`
   - `duration_days` = `30`
   - `status` = `'success'`

### Why not call `extend_subscription(...)`
That RPC requires `auth.uid()` to be the pharmacy's admin and runs in the user's session — it can't be invoked from a server-side admin override. Direct SQL is the correct path for a manual offline reconciliation.

### Verification after apply
- `SELECT name, subscription_expiry FROM public.pharmacies WHERE id = '5dd79692-…'` → expiry ~30 days out.
- `SELECT amount_bdt, duration_days, status, created_at FROM public.subscription_payments WHERE pharmacy_id = '5dd79692-…' ORDER BY created_at DESC LIMIT 1` → the new row.

No code files will change.
