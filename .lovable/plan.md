## Status: already implemented — verification plan

The current `src/hooks/useSubscription.ts` already does exactly what's described:

1. The pharmacy SELECT includes `created_at`:
   ```ts
   .select("subscription_plan, subscription_started_at, subscription_expiry, last_popup_shown, created_at")
   ```
2. When the pharmacy has no `subscription_expiry`, the trial fallback uses the **shop's** `created_at`, not the auth user's:
   ```ts
   setSub(buildDefaultTrialSub((pharm?.created_at as string | null) ?? createdAt));
   ```
3. `buildDefaultTrialSub` computes `expiry = shop.created_at + 30 days`, `total_days = 30`. Every role in the same shop resolves to the identical target timestamp.
4. `CountdownTimer` / `useCountdown` already render `target - new Date()` live, so refresh just recomputes against the same fixed shop anchor — no reset.
5. RLS on `pharmacies` already lets Owner, Manager, and Salesman read their own shop row including `created_at`.

## What I propose

No code changes. Instead:

1. Verify in the live preview by logging in as each role (Owner, Manager, Salesman) of the same shop and confirming:
   - Days / hours / minutes / seconds match across roles (within a second).
   - Refreshing the Subscription page does not jump the timer.
   - UI (StatusCard, progress bar, "Free Trial" badge) is identical for all three.
2. If any role still shows a different value, the likely cause is **one of these accounts is not actually attached to the same `pharmacy_id`** (e.g. a Manager/Salesman who signed up standalone and never accepted an invitation — they hit the "no pharmacy" branch which falls back to *their own* `auth.users.created_at`). In that case the fix is data, not code: ensure the user has a `profiles.pharmacy_id` pointing at the shop.

## If you want me to harden it further

Optional follow-up changes I can make if you confirm the issue persists:

- Add a small debug log in `useSubscription` (dev-only) printing `pharmacy_id`, `pharm.created_at`, and resolved `expiry_date` so we can confirm all three roles resolve to the same anchor.
- Force the trial fallback to refuse to use the auth user's `created_at` at all — if `pharmacy_id` exists but the pharmacy row fails to load, show a loading/error state instead of a per-user anchor.

Tell me which roles you've tested and what timer values each one shows, and I'll either confirm we're done or apply the hardening above.
