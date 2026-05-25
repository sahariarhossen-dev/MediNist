## Root cause

`buildDefaultTrialSub()` in `src/hooks/useSubscription.ts` uses `new Date()` as the trial start every time the hook runs. On refresh, the 30-day window restarts. There is no persistence and no tie to the user's actual signup time.

## Fix

Anchor the default trial to `auth.user.created_at` so the countdown is deterministic across refreshes and devices, and naturally expires 30 days after signup.

### 1. `src/hooks/useSubscription.ts`

- Change `buildDefaultTrialSub` to accept a `createdAt: string` argument:
  - `started_at = createdAt`
  - `expiry_date = new Date(createdAt).getTime() + 30 * 86_400_000` (ISO string)
  - `total_days = 30`
  - `plan = "Free Trial"`
- In `refetch`, read `userData.user?.created_at` alongside `uid`. Pass it into every `buildDefaultTrialSub(createdAt)` call (missing user, missing pharmacy_id, missing/expired pharmacy row, catch branch).
- If `created_at` is somehow missing (shouldn't happen for an authenticated user), fall back to `new Date().toISOString()` to avoid crashes.
- Leave the real `buildSub(pharm)` path untouched — paid users still use `subscription_expiry` from the DB.

### 2. Expiration behavior

No new code needed. `getStatus(sub, payments)` in `src/lib/subscriptionStatus.ts` already returns `"expired"` when `expiry_date < now` and no successful payment exists. `Subscription.tsx` already renders the rose "renew to unlock the app" banner when `isExpired`, and `SubscriptionExpiredOverlay` (mounted elsewhere) prompts payment. Because trial expiry is now derived from `created_at + 30d`, a refresh after day 30 will correctly flip the UI from "Free Trial" → "Expired".

### 3. No other changes

- No DB migration (purely client-derived from `auth.users.created_at`, which is always available via `supabase.auth.getUser()`).
- No changes to `StatusCard`, `CountdownTimer`, `useCountdown`, or `Subscription.tsx` — they already consume `sub.expiry_date` and `sub.total_days`.

## Acceptance criteria

- New user registered at T sees a countdown to T+30d. Refreshing at any later time shows the same target, with seconds ticking down continuously.
- After T+30d, the page shows "Expired" status + renew banner instead of "Free Trial".
- Paid users (real `subscription_expiry` in `pharmacies`) are unaffected.

## Files touched

- `src/hooks/useSubscription.ts` (only)
