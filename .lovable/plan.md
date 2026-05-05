## Plan: Simplified Subscription Renewal with Confirmation Modal & Checkout

Replace the current multi-plan ExtendPlans flow with a single-plan renewal flow: Renew Now button → confirmation modal → checkout page with payment gateways → on success, +30 days added via existing `extend_subscription` RPC.

### 1. Update `Subscription.tsx` (page)
- Remove `ExtendPlans` and `showPlans` toggle.
- `RenewButton` (already emerald, full-width, lightning-bolt) directly opens a confirmation `Dialog`.
- Modal shows:
  - Title: "Renew Subscription"
  - Body: "Plan Price: 2000 BDT | Validity: 1 Month (30 Days)"
  - Primary button: "Proceed to Checkout" → `navigate('/subscription/checkout')`
- StatusCard and PaymentHistory remain.

### 2. New page `src/pages/SubscriptionCheckout.tsx`
- Header with back button, title "Checkout".
- Order summary card: Pharmacy Pro, 30 days, ৳2000.
- Payment gateway selection list (radio cards) with mock options:
  - bKash, Nagad, Rocket, Card (Visa/Master)
  - Each shown with brand-tinted icon/badge.
- "Pay ৳2000" button (emerald). On click:
  - Show loading state (mock 1.5s gateway processing).
  - Call `supabase.rpc('extend_subscription', { _days: 30, _amount: 2000 })`.
  - Fire confetti + toast "Subscription Extended Successfully!".
  - Navigate back to `/subscription` (timer reflects new expiry instantly via existing realtime hook).

### 3. Route
Add `/subscription/checkout` in `src/App.tsx` (protected, inside `AppLayout`).

### 4. StatusCard tweak
Already matches spec (mint card, Active badge, 4 timer boxes, progress bar, "Renews on…" + "% remaining"). No changes needed beyond verifying current emerald tone renders as mint — keep as-is.

### 5. PaymentHistory
Already shows date, +days, ৳ amount, status pill. Keep as-is.

### 6. Files
- Edit: `src/pages/Subscription.tsx`, `src/App.tsx`
- Create: `src/pages/SubscriptionCheckout.tsx`
- Optionally remove: `src/components/subscription/ExtendPlans.tsx`, `RenewButton.tsx` props (`open`) simplified

### Database
No schema changes — existing `extend_subscription(_days, _amount)` RPC handles +30 day stacking and inserts into `subscription_payments`. Realtime subscription in `useSubscription` already pushes the update to the timer instantly.

### Notes
- This is a mock checkout (no real payment integration). If you later want real Bangladeshi payment gateways (bKash/Nagad), that requires a separate edge-function integration with each provider's API.
