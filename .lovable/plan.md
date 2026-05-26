# Sync subscription countdown across Owner, Manager, Salesman

## Root cause

In `src/hooks/useSubscription.ts`, when the pharmacy has no `subscription_expiry` set, the hook falls back to `buildDefaultTrialSub(userData.user.created_at)` — the **currently logged-in user's** signup timestamp.

- Owner: signed up at shop creation → trial end ≈ shop_created + 30d (looks correct).
- Manager / Salesman: invited later → their `auth.users.created_at` is later → countdown is different per user and shifts whenever they re-auth.

The countdown must be anchored to a single shop-wide timestamp for every role.

## Fix

Use `pharmacies.created_at` as the universal anchor for the free-trial fallback. Everyone in the same shop then sees the identical "Shop created + 30 days" target, and refresh just recomputes `target - now()` against that fixed value.

### Changes — `src/hooks/useSubscription.ts` only

1. Extend the pharmacy select to also fetch `created_at`:
   ```ts
   .select("subscription_plan, subscription_started_at, subscription_expiry, last_popup_shown, created_at")
   ```
2. Change the trial fallback path so it uses `pharm.created_at` (not the auth user's `created_at`):
   - When `pharm` exists but `subscription_expiry` is null → `buildDefaultTrialSub(pharm.created_at)`.
   - When user has no pharmacy yet (pre-onboarding) → keep current behavior using auth user's `created_at` (only the unattached signer sees this; no shop members involved).
3. `buildDefaultTrialSub` logic itself is unchanged: `expiry = started + 30 days`, `total_days = 30`. Because `started` is now the pharmacy's creation timestamp, the expiry is identical for Owner, Manager and Salesman.

No changes needed to:
- `CountdownTimer` / `useCountdown` — already pure `target - now()`.
- `StatusCard` — already renders from `sub.expiry_date` and `sub.started_at`.
- `Subscription.tsx` UI / fallback label ("Free Trial") — already uniform.
- RLS — `pharmacies` SELECT policy already allows all members to read their own pharmacy row (including `created_at`).

## Verification

- Log in as Owner → trial card shows X days remaining anchored to shop creation.
- Log in as Manager and Salesman in same shop → identical days/hours/minutes (within seconds), and refreshing does not reset or jump.
- Once a real `subscription_expiry` is set on the pharmacy, all roles continue to share the same active countdown (already working).
