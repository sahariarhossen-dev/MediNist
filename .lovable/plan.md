## Findings

After reviewing the current implementation, most of what you listed is already working correctly. Only the welcome pop-up needs a behavior change.

### Already correct (no changes needed)

1. **Countdown anchored to fixed dates** — `StatusCard` builds `expiry = new Date(sub.expiry_date)` from `pharmacies.subscription_expiry` (DB value). `useCountdown` recomputes `target.getTime() - Date.now()` every second. It does NOT reset on refresh.
2. **Total trial duration** — `useSubscription.buildSub` derives `total_days` from `subscription_expiry - subscription_started_at`, so for a fresh trial this is exactly 30.
3. **Dynamic progress bar** — `StatusCard` already computes `pct = (diff / totalMs) * 100` using the live `diff` from `useCountdown`, and renders both the `<Progress value={pct}>` bar and the `Math.round(pct)` text. Updates every second.
4. **Subscription stacking** — `extend_subscription` RPC uses `GREATEST(COALESCE(subscription_expiry, now()), now()) + _days`, so paying with 5 days left and buying 30 produces 35 days remaining. Payment History reads from `subscription_payments` which the RPC inserts on every successful renewal.

### The one real bug — daily pop-up

Current: `Subscription.tsx` uses `localStorage["trial_welcome_seen_${user.id}"] = "1"` — a permanent flag, so the modal shows exactly once forever.

Required: show once per calendar day, only while the user is still in trial.

## Changes

### `src/pages/Subscription.tsx`

Replace the seen-once flag with a date-based check:

```text
key  = `trial_welcome_last_${user.id}`
today = new Date().toISOString().slice(0, 10)   // "YYYY-MM-DD" (local)
last = localStorage.getItem(key)

if (isTrial && last !== today) setShowWelcome(true)

dismissWelcome():
  localStorage.setItem(key, today)
  setShowWelcome(false)
```

Guard already covers "only while trial active" because `isTrial` is false once expired or after a paid renewal.

No other files need to change. No DB migration. No new dependencies.
