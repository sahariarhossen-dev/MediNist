## Audit vs your requirements

Your spec asks for a `localStorage`-based `shopRegistrationDate`. The current app already implements the same date-driven behavior, but anchored to the database (`pharmacies.subscription_started_at` / `subscription_expiry`) instead of `localStorage`. DB-anchored is strictly better:

- Survives cache clears, incognito, device switches, reinstalls
- Cannot be tampered with by the user to extend their trial
- Stays consistent across multiple staff devices for the same pharmacy

I recommend keeping the DB as the source of truth and only making the small fixes below. If you'd rather force pure-`localStorage` behavior, say so and I'll switch the anchor.

## Requirement-by-requirement status

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Persistent registration date, expiry = +30 days | Done | `useSubscription.buildSub` reads `subscription_started_at` & `subscription_expiry`; trial seeded to +30d on signup. |
| 2 | `setInterval` every 1000ms, cleared on unmount, `timeLeft = expiry - now` | Done | `useCountdown` (`src/hooks/useCountdown.ts`) does exactly this. |
| 3 | UI derived from `timeLeft`, never resets on refresh / button click | Done | `StatusCard` + `CountdownTimer` render purely from `useCountdown(expiry)`. "Start Exploring" only closes the modal. |
| 4 | Progress bar % updates every second | Done | `StatusCard` computes `pct = diff / totalMs * 100` from the live `diff`. |
| 5 | Welcome pop-up once per calendar day | Done | `Subscription.tsx` uses `trial_welcome_last_${user.id}` = `YYYY-MM-DD`. |
| 6 | Subscription stacking (new days added to current expiry) | Done | `extend_subscription` RPC: `GREATEST(expiry, now()) + _days`. |
| 7 | Full-screen blurred overlay when expired, blocks app until Renew | Done | `SubscriptionExpiredOverlay` mounted from `AppLayout` with `backdrop-blur-md` + `z-[100]`; allowed only on `/subscription`. |

## Small fixes worth making

1. **Progress bar smoothness** — `Progress` (Radix) currently has a `transition-all` CSS rule on the indicator. Combined with per-second value updates this can look laggy. Set `transition-none` on the indicator inside `StatusCard`'s usage (or pass a prop) so the bar tracks the per-second value exactly.

2. **`total_days` rounding** — `buildSub` uses `Math.ceil(...)` which can yield 31 for a fresh 30-day trial when `started_at` is microseconds after midnight boundaries. Switch to `Math.round` so the % math is anchored on the intended 30-day total.

3. **Expired overlay — also block hardware back / nav** — the overlay currently dims & blurs but `BottomNav` underneath still receives clicks via the layout order. Confirmed it does not (overlay is `fixed inset-0 z-[100]`, BottomNav is lower z), so no change needed. Listed for transparency.

No new files. No DB migration. No new dependencies.

## Files to edit

- `src/components/subscription/StatusCard.tsx` — pass `className="[&>div]:transition-none"` (or similar) to `<Progress>` so the bar updates instantly each tick.
- `src/hooks/useSubscription.ts` — change `Math.ceil` to `Math.round` in `totalDays`.

## Optional: switch anchor to localStorage

Only if you confirm you want this (not recommended). Would replace `buildSub` to read `localStorage["shop_registration_date"]` (seeding it with `new Date().toISOString()` on first read) and ignore the DB columns. This makes trials trivially resettable by clearing site data — please confirm before I do it.
