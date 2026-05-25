# Fix Subscription page infinite loading

## Root cause

`src/pages/Subscription.tsx` renders the spinner whenever `loading || !sub` is true. In `src/hooks/useSubscription.ts`:

- If the user has no `pharmacy_id` yet, the hook returns early with `sub = null`.
- If the pharmacy row has no `subscription_expiry`, `sub` is left as `null`.
- The pharmacies query uses `.maybeSingle()` so it won't throw, but a transient error still leaves `sub = null` with `loading = false` → spinner shows forever because of the `!sub` guard.

## Changes

### 1. `src/hooks/useSubscription.ts`
- Wrap both Supabase calls in `try / catch / finally` so `setLoading(false)` always runs, even on PGRST116 or network errors.
- Add a `buildDefaultTrialSub()` helper that returns a 30‑day Free Trial starting now (plan: `"Free Trial"`, `total_days: 30`).
- If `pharmacy_id` is missing, or the pharmacy row is missing, or `subscription_expiry` is null/undefined, set `sub` to the default trial instead of `null`.
- Keep `status` derivation untouched — with no successful payments it naturally resolves to `"trial"`, so `isTrial` becomes true and the welcome modal/badge behave correctly.

### 2. `src/pages/Subscription.tsx`
- Change the loading guard from `loading || !sub` to just `loading`, since `sub` is now always populated after load.
- Keep the existing `StatusCard` / `RenewButton` / `PaymentHistory` rendering — they already handle the trial case via `isTrial`.
- Guard the `WelcomeTrialModal` and other `sub`-dependent blocks with a simple `sub &&` (defensive, even though it will always be truthy post‑load).

### 3. No DB / RLS / edge‑function changes
The existing schema already defaults `subscription_plan` to `'Pharmacy Pro'` and trial logic is purely client-side based on absence of successful payments. No migration needed.

## Acceptance criteria

- A freshly registered user (no pharmacy subscription row populated) lands on `/subscription` and immediately sees: Plan = Free Trial, Status = Active, 30‑day countdown.
- Spinner disappears within one render even if the pharmacy query errors.
- Existing users with a real `subscription_expiry` continue to see their real plan and countdown — behavior unchanged.

## Files touched

- `src/hooks/useSubscription.ts`
- `src/pages/Subscription.tsx`
