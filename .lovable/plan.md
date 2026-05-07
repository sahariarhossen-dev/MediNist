# Free Trial Welcome Modal + App Freeze on Expiry

Build on top of the existing Subscription page and `useSubscription` hook (which already exposes `subscription_started_at` / `subscription_expiry`). No new tables — the trial is just the existing 30-day window assigned at pharmacy creation.

## 1. Subscription status helper

Create `src/lib/subscriptionStatus.ts`:
- `getStatus(sub, hasPaidPayment)` → `"trial" | "active" | "expired"`
  - `expired` if `expiry < now` and no successful payment beyond expiry
  - `active` if a `success` payment exists in `subscription_payments`
  - otherwise `trial` (initial 30-day window from `subscription_started_at`)
- `isInTrial(sub, payments)` — true when no successful payment record exists yet and we're inside the original 30-day window.

Extend `useSubscription` to also return `status` and `isTrial` derived from `payments` + `sub`.

## 2. Welcome trial modal

New component `src/components/subscription/WelcomeTrialModal.tsx`:
- Branded soft emerald/teal gradient card inside our existing `Dialog`.
- Sparkle/gift icon (lucide `Sparkles` + `Gift`) with a subtle CSS bounce/scale animation (no extra deps; pure Tailwind keyframes already present in `tailwind.config`).
- Copy: "Welcome to the Pro Family! 🌟 You've unlocked 1 month of free premium access to manage your pharmacy effortlessly."
- Sub-line shows trial end date.
- Primary button: "Start Exploring" → closes modal and writes a flag.

Trigger logic in `Subscription.tsx`:
- Show once per user when `isTrial === true` AND `localStorage.getItem("trial_welcome_seen_<user.id>")` is unset.
- On dismiss, set that key.

(Per-user localStorage key avoids cross-account leakage; no DB column needed for this lightweight first-visit flag.)

## 3. App freeze overlay on expiry

New component `src/components/subscription/SubscriptionExpiredOverlay.tsx`:
- Fixed full-screen overlay (`z-[100]`, backdrop blur, white card centered).
- Lock icon, title "Subscription Expired", message "Your trial / subscription has ended. Renew now to continue using MediNist."
- Single CTA "Renew Now to Continue" → `navigate("/subscription")`.
- Blocks all interaction (covers BottomNav too).

Mount it in `AppLayout.tsx`:
- Use `useSubscription()` inside layout.
- If `status === "expired"` AND current route is not `/subscription` or `/subscription/checkout`, render the overlay above children. On the subscription pages we still allow access so the user can pay.
- Returning the overlay alongside children (not instead of) keeps state mounted but the overlay's `pointer-events` blocks everything beneath.

## 4. Subscription page tweaks

- StatusCard already shows the countdown + progress (`% remaining`). Add a small "Free Trial" pill (instead of "Active") when `isTrial` is true; keep emerald/amber/rose tone logic.
- When `expired`, show a red banner above the renew button: "Your access is paused — renew to unlock the app."

## 5. Mock / fallback for shop_created_at

Already handled by `useSubscription.buildSub`: if `subscription_started_at` is null it falls back to "now"; if `subscription_expiry` is null it falls back to now + 30 days. This satisfies the "mock shop_created_at" requirement without schema changes.

## Files

Created:
- `src/lib/subscriptionStatus.ts`
- `src/components/subscription/WelcomeTrialModal.tsx`
- `src/components/subscription/SubscriptionExpiredOverlay.tsx`

Edited:
- `src/hooks/useSubscription.ts` — derive & return `status`, `isTrial`.
- `src/components/AppLayout.tsx` — mount expired overlay globally.
- `src/pages/Subscription.tsx` — render welcome modal + trial pill + expired banner.
- `src/components/subscription/StatusCard.tsx` — "Free Trial" badge variant.

No DB migrations, no new dependencies.
