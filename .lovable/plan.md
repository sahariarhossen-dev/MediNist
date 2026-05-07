## Goal

Switch the daily welcome popup from `profiles.last_trial_popup_date` (per-user) to `pharmacies.last_popup_shown` (per-shop), and remove any chance of the countdown "resetting" on refresh by eliminating the silent 30-day fallback in `useSubscription`.

## Why the timer appeared to reset before

In `src/hooks/useSubscription.ts`, `buildSub` does:

```ts
const startedAt = row.subscription_started_at ?? new Date().toISOString();
const expiry = row.subscription_expiry ?? new Date(Date.now() + 30 * 86_400_000).toISOString();
```

If a fetch ever resolved with a row missing `subscription_expiry`, the UI would compute a brand-new "now + 30 days" value on every mount — looking like a reset. We will remove that client-side fallback so the timer is **only** ever derived from the database.

## Changes

### 1. Database migration

```sql
ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS last_popup_shown date;

-- Backfill trial expiry for any shop missing it (defensive — prevents legacy rows
-- from ever falling into the old client-side fallback path)
UPDATE public.pharmacies
SET subscription_expiry = COALESCE(subscription_started_at, created_at) + interval '30 days'
WHERE subscription_expiry IS NULL;
```

RLS check: existing `pharmacies` policies already let any pharmacy member read the row, and `Pharmacy admins can update their pharmacy` covers updates by the owner/admin. The new column is covered by these table-level policies — no extra policy needed. Non-admin staff can read the popup date but cannot update it; that's fine because only the admin's session needs to write it (the popup is shown to admins on the Subscription page).

If we want every staff member to be able to dismiss the popup for the shop, we'd need a narrower policy. **Decision: keep it admin-only** since the Subscription page itself is an admin surface.

### 2. `src/hooks/useSubscription.ts` — strict DB-only expiry

- Add `last_popup_shown` to the select.
- Remove the `?? now + 30d` fallback. If `subscription_expiry` is null after fetch, surface that as a transient "still loading / not initialized" state rather than fabricating a new expiry.
- Keep `loading: true` until the pharmacy row is actually returned (currently `setLoading(false)` runs even when there is no pharmacy_id; we'll only flip `loading` once the fetch resolves with a row or a definitive null).
- Expose `lastPopupShown: string | null` from the hook.

### 3. `src/pages/Subscription.tsx` — read/write the new column

- Replace the `profiles.last_trial_popup_date` read with `lastPopupShown` from `useSubscription`.
- `dismissWelcome` updates `pharmacies.last_popup_shown = today` for the current `pharmacyId` (admin only — non-admins won't see the popup trigger).
- Remove the old profile-based query.

### 4. `src/integrations/supabase/types.ts`

Auto-regenerated after the migration — no manual edit.

### 5. Cleanup

The previous `profiles.last_trial_popup_date` column becomes unused. We'll leave it in place (dropping it is not required and avoids breaking any cached client). Mention this to the user; they can drop later if desired.

## Files touched

- new migration: add `pharmacies.last_popup_shown` + backfill expiry
- `src/hooks/useSubscription.ts`
- `src/pages/Subscription.tsx`

## Verification after build

- Refresh the page repeatedly → countdown stays identical (no reset).
- Open on a second device/browser as the same shop → popup does not re-appear the same day.
- Inspect the `pharmacies` row: `subscription_expiry` is non-null and `last_popup_shown` updates to today after dismissing.
