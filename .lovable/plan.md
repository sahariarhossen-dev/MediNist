## Goal

Make the Dashboard's "Cash in Hand" card show the exact same shop-wide value as the Daily Transactions page, and update both screens in real time when any user logs a sale, payment, expense, or investment.

## Problem

Today the two screens compute "Cash in Hand" with different inputs, so they disagree:

| Input | Dashboard (`Index.tsx`) | Daily Transactions |
|---|---|---|
| Sales scope | filtered by current `user_id` | pharmacy-wide |
| Dues source | `customer_dues` table | `customer_ledger` (entry_type='due') |
| Cash-in categories | `sale_cash` + `due_collection` + `other_in` | only `other_in` for investments, plus `due_collection` separately |
| Refresh | one-shot on mount | one-shot on mount |

The Daily Transactions formula is the source of truth:
`Cash in Hand = Starting Balance + Cash Sales (Total Sales − New Dues) + Due Received + Investments (other_in) − Total Payments (direction=out)`

## Changes

### 1. `src/pages/Index.tsx` — rewrite `fetchCashInHand`

Replace the current implementation with the exact same query set and formula used in `DailyTransactions.tsx`:

- Drop `.eq("user_id", userId)` from the sales query so the figure is pharmacy-wide.
- Switch the dues source from `customer_dues` to `customer_ledger` (`pharmacy_id = ...`, `entry_type = 'due'`, today's range) — this matches `duesOpen` on Daily Transactions.
- Compute `cashSalesTotal = max(0, salesTotal − duesOpen)`.
- From today's `cash_transactions`:
  - `cashInInvestments` = sum where `direction='in' AND category='other_in'`
  - `dueReceived` = sum where `direction='in' AND category='due_collection'`
  - `totalPayments` = sum where `direction='out'`
- Starting balance: previous day's `daily_closings.net_balance` if present, else `pharmacy_settings.starting_cash_balance`.
- Final: `startingBalance + cashSalesTotal + dueReceived + cashInInvestments − totalPayments`.

The "Total Sales" KPI on the Dashboard stays user-scoped (personal performance) — only "Cash in Hand" changes.

### 2. Real-time sync on both pages

Add a Supabase realtime subscription that re-runs the cash-in-hand fetch whenever relevant rows change for the user's pharmacy.

- In `src/pages/Index.tsx`: subscribe to `postgres_changes` on `sales`, `cash_transactions`, `customer_ledger`, and `daily_closings` filtered by `pharmacy_id=eq.<id>`. On any insert/update/delete, call `fetchCashInHand()` (debounced via a small timeout to coalesce bursts). Clean up the channel on unmount / pharmacy change.
- In `src/pages/DailyTransactions.tsx`: same subscription pattern, calling `loadData()` on changes. Only react when the change is for the currently viewed `date` (or always reload when viewing today).

No DB schema changes are required — RLS already lets pharmacy members read these tables, and Supabase realtime works with existing replication for `public` tables. If a table isn't in the realtime publication yet, we'll add it via a migration enabling `supabase_realtime` for `sales`, `cash_transactions`, `customer_ledger`, and `daily_closings`.

### 3. Migration (only if needed)

Add the four tables to the `supabase_realtime` publication so `postgres_changes` events fire:

```sql
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.cash_transactions;
alter publication supabase_realtime add table public.customer_ledger;
alter publication supabase_realtime add table public.daily_closings;
```

(Wrapped in `do $$ ... exception when duplicate_object then null; end $$;` blocks so re-runs are safe.)

## Result

- Dashboard "Cash in Hand" will exactly equal Daily Transactions' Net Cash Balance (e.g. ৳8,212).
- Any sale, payment, expense, or investment logged by Owner / Manager updates the value live on both screens without a manual refresh.
- Personal "Total Sales" on the Dashboard remains scoped to the logged-in user as before.

## Files touched

- `src/pages/Index.tsx` — rewrite `fetchCashInHand`, add realtime subscription
- `src/pages/DailyTransactions.tsx` — add realtime subscription that re-runs `loadData`
- New migration to ensure the four tables are in the `supabase_realtime` publication
