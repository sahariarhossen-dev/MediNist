## Update Monthly Subscription Price from ৳2,000 to ৳500

### Files to modify

1. **src/pages/SubscriptionCheckout.tsx**
   - Change `const PLAN_PRICE = 2000;` to `const PLAN_PRICE = 500;`
   - This updates the order summary display (`৳{PLAN_PRICE}`), the total line (`৳{PLAN_PRICE.toLocaleString(...)}`), and the sticky pay button label (`Pay ৳{PLAN_PRICE.toLocaleString(...)}`).
   - This also updates the `_amount` parameter passed to `supabase.rpc("extend_subscription", ...)` so the gateway records the correct amount.

2. **src/pages/Subscription.tsx**
   - Change the confirmation dialog text from `2000 BDT` to `500 BDT` in the "Plan Price" row.

### Not changed

- `src/lib/subscriptionMock.ts` — the `extendPlans` array (৳499 / ৳1,299 / ৳2,399) is for **add-on top-up plans**, not the base monthly subscription, so it is left untouched.
- **Database** — the `extend_subscription` RPC accepts `_amount` as a parameter and only validates `>= 0`, so no migration is needed.