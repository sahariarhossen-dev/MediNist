## Status: Already Implemented (with one gap)

Auditing the codebase against your 6 requirements — the DB-driven subscription system is **already in place**. Only the daily pop-up needs to be moved off localStorage to satisfy "use a database field" properly.

### Current implementation map

| Requirement | Where it lives | Status |
|---|---|---|
| 1. DB fetch (`pharmacies.subscription_started_at`, `subscription_expiry`) | `src/hooks/useSubscription.ts` → `refetch()` | Done |
| 1b. Trial init = registration + 30 days | `supabase/functions/register-pharmacy/index.ts` (sets `subscription_expiry` on shop creation); `buildSub` falls back to `now + 30d` if null | Done |
| 2. 1-second countdown from DB expiry | `src/hooks/useCountdown.ts` (1000ms interval) consumed by `CountdownTimer` / `StatusCard` | Done |
| 3. Dynamic progress bar (start → expiry) | `StatusCard.tsx`: `pct = diff / (total_days * 86_400_000) * 100` | Done |
| 4. Daily welcome pop-up | `Subscription.tsx` uses `localStorage["trial_welcome_last_<uid>"]` (date string) | Works, but uses localStorage |
| 5. Stacking renewals (`new = current + days`) | `extend_subscription` RPC: `v_base := GREATEST(current, now()); v_new := v_base + days` | Done |
| 6. Global expired overlay | `AppLayout.tsx` renders `SubscriptionExpiredOverlay` whenever `isExpired` (except on `/subscription`) | Done |

### The one fix to apply

**Move the "last popup shown" flag into the database** so it survives device changes (matching your spec: *"Use a 'last_popup_shown' field in the database or local storage"* — currently it's localStorage, which resets when a user logs in on a new device).

#### Plan

1. **Migration** — add a per-user column:
   ```sql
   ALTER TABLE public.profiles
     ADD COLUMN last_trial_popup_date date;
   ```
   No new RLS needed (profiles already restricts to `id = auth.uid()`).

2. **`src/pages/Subscription.tsx`** — replace the localStorage check:
   - On mount (when `isTrial` and profile loaded), read `profiles.last_trial_popup_date`. Show `WelcomeTrialModal` if it ≠ today (`YYYY-MM-DD`).
   - In `dismissWelcome`, `update profiles set last_trial_popup_date = current_date where id = auth.uid()`.
   - Remove the `localStorage` get/set lines.

3. **No other files change.** The countdown, stacking RPC, expired overlay, and progress bar already meet spec.

### Why not rebuild more

- `useSubscription` already pulls expiry strictly from `pharmacies` row — countdown can't drift across refresh/device.
- `extend_subscription` RPC already does `GREATEST(current_expiry, now()) + days`, so a renewal with 3 days left correctly produces +33 days total.
- The expired overlay already locks every route except `/subscription` so users can pay.

Approve and I'll run the migration + edit `Subscription.tsx`.