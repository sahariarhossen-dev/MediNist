# Subscription Page Upgrade

Restore an extend/renew action below the status card, wire it to Supabase so subscription expiry truly persists and stacks, and refresh the UI in real time with celebratory feedback.

## Layout (top → bottom)
1. Header (Title)
2. `StatusCard` (active badge + DD:HH:MM:SS countdown, dynamic green/amber/rose theme — already implemented)
3. **NEW:** Full-width primary "Renew Now" button (emerald theme, `Zap` + `CreditCard` icons)
4. `ExtendPlans` grid (1 / 3 / 6 month tiers) — collapsible, opens when "Renew Now" is tapped
5. `PaymentHistory` table

## Database changes (migration)
Add subscription tracking to the existing `pharmacies` table (we don't have a `shops` table — `pharmacies` is the equivalent):

```sql
alter table public.pharmacies
  add column if not exists subscription_expiry timestamptz,
  add column if not exists subscription_plan text default 'Pharmacy Pro',
  add column if not exists subscription_started_at timestamptz default now();

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  user_id uuid not null,
  amount_bdt numeric not null,
  duration_days int not null,
  status text not null default 'success',
  created_at timestamptz not null default now()
);
alter table public.subscription_payments enable row level security;

create policy "Members view pharmacy subscription payments"
  on public.subscription_payments for select to authenticated
  using (pharmacy_id = public.get_user_pharmacy_id());

create policy "Admins insert subscription payments"
  on public.subscription_payments for insert to authenticated
  with check (pharmacy_id = public.get_user_pharmacy_id()
              and user_id = auth.uid()
              and public.is_pharmacy_admin());
```

Plus a SECURITY DEFINER RPC `extend_subscription(_days int, _amount numeric)` that:
- Verifies the caller is admin of their pharmacy
- Reads current `subscription_expiry`
- Computes `base = greatest(current_expiry, now())` then `new_expiry = base + _days`
- Updates `pharmacies.subscription_expiry`
- Inserts a row into `subscription_payments`
- Returns the new expiry

This guarantees stacking happens server-side (cannot be bypassed by a manipulated client).

## Frontend changes

**New hook `useSubscription`**
- Fetches current pharmacy's `subscription_expiry`, `subscription_plan`, `subscription_started_at` via `get_my_pharmacy_public` (extended) or a direct select
- Fetches `subscription_payments` history
- Subscribes to Supabase Realtime channels on both `pharmacies` (filtered to current id) and `subscription_payments` so the countdown jumps instantly after a renewal from any device
- Exposes `{ sub, payments, loading, refetch }`

**New component `RenewButton`**
- Emerald gradient, `Zap` icon, full width, large
- Toggles visibility of `<ExtendPlans />` (already exists, restored)

**Restored `ExtendPlans`**
- Already in the codebase — re-import in `Subscription.tsx`
- Each plan's "Pay Now" calls `handleSubscriptionPayment(plan)`

**`handleSubscriptionPayment(plan)` in `Subscription.tsx`**
- Sets per-plan `loading` state on the button
- Calls `supabase.rpc('extend_subscription', { _days: plan.days, _amount: plan.price_bdt })`
- On success:
  - Toast (sonner): "Subscription Extended Successfully!"
  - Trigger confetti (canvas-confetti) burst from button position
  - Realtime listener auto-refreshes — no manual refetch needed, but call `refetch()` as a fallback
- On error: error toast, no DB write

**Countdown tone thresholds** — already correct (`>=7` green, `3-7` amber, `<3` rose).

## Dependencies
- Add `canvas-confetti` (+ `@types/canvas-confetti`)

## Files
- `supabase/migrations/<timestamp>_subscription.sql` (new)
- `src/hooks/useSubscription.ts` (new)
- `src/components/subscription/RenewButton.tsx` (new)
- `src/pages/Subscription.tsx` (rewire to live data + confetti + handler)
- `src/components/subscription/ExtendPlans.tsx` (already exists — re-used as-is, accepts `loadingId` prop for per-card spinner)
- `src/lib/subscriptionMock.ts` (keep `extendPlans` + formatters; remove unused mocks)

## Notes
- Only pharmacy admins can renew (matches RLS). Non-admins see the button disabled with a tooltip "Only admins can renew".
- If `subscription_expiry` is null on first load, the hook seeds it client-side as `now() + 30 days` for display only; first successful payment persists a real value.
