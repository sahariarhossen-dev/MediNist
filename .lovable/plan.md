

## Daily closing + cash carry-forward

Goal: when the day ends, lock in the day's net cash and use it as the starting balance for the next day. Show a clean summary card at the bottom of `/more/daily-transactions`, and surface a "Closing Balance from [prev date]" entry as the first row of the new day's feed.

### 1. Database — store per-day closings (migration)

New table `daily_closings` keyed by pharmacy + date so values persist across devices/refreshes:

```
daily_closings (
  id uuid pk,
  pharmacy_id uuid not null,
  closing_date date not null,
  starting_balance numeric not null default 0,
  total_sales numeric not null default 0,
  total_cash_in numeric not null default 0,
  total_payments numeric not null default 0,
  total_due numeric not null default 0,
  net_balance numeric not null default 0,        -- carries forward
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pharmacy_id, closing_date)
)
```

RLS: members of the pharmacy can SELECT; INSERT/UPDATE allowed for members (the auto-close edge function will use service role anyway). Indexed on `(pharmacy_id, closing_date desc)`.

We will keep `pharmacy_settings.starting_cash_balance` as the **initial seed** only (used when no prior closing exists). Day-to-day starting balance comes from the previous day's `net_balance`.

### 2. Edge function — `close-daily-transactions` (runs at midnight)

A scheduled function (pg_cron + pg_net hitting the function URL every day at 00:05 local) that, for each pharmacy with activity on the previous date:

1. Computes `total_sales` (sum of completed sales), `total_cash_in` (manual `direction='in'` of `other_in` + `due_collection`), `total_payments` (`direction='out'`), `total_due` (open dues created that day), and the day's starting balance (= previous closing's `net_balance`, or `pharmacy_settings.starting_cash_balance`, or 0).
2. `net_balance = starting + (total_sales - total_due) + total_cash_in - total_payments`.
3. Upserts a row into `daily_closings` for that pharmacy + date.

Cron will be scheduled via `pg_cron` + `pg_net` SQL (insert tool, not migration, since URL/anon key are project-specific).

### 3. Page changes — `src/pages/DailyTransactions.tsx`

- **Starting balance lookup**: replace `pharmacy_settings.starting_cash_balance` reading with a query for the most recent `daily_closings` row before the selected date. Fallback chain: previous closing → `pharmacy_settings.starting_cash_balance` → 0.
- **First-row "Closing Balance from …" pill**: when a previous closing exists, prepend a synthetic neutral entry to `visibleFeedItems` with a blue Wallet icon, label `Closing Balance from DD/MM/YYYY`, amount = carried `net_balance`. Not counted in totals (it's already baked into starting balance).
- **Daily Closing Summary card** at the bottom of the page (below the feed, above the FAB area):
  - Light grey (`bg-gray-100`) rounded card, title `Daily Closing Summary`.
  - Rows: Total Sales `+`, Total Cash In `+`, Total Payments `−`, Today's Due (neutral), divider, **Net Cash Balance** in bold blue.
- The summary uses the same values already calculated in the page (`salesTotal`, `manualCashIn`, `totalPayments`, `duesOpen`, `cashInHand`).

### 4. Visual / branding

- AppHeader (M logo + MediNist) untouched.
- Summary card: `bg-gray-100 rounded-2xl p-4 mt-5 mx-5`, rows `flex justify-between text-sm`, net row `text-blue-700 font-bold text-base`, top border separator.
- Closing-balance feed row: blue circle with `Wallet` icon, neutral grey amount text.

### 5. Files

- **New migration**: `daily_closings` table + RLS + index.
- **New edge function**: `supabase/functions/close-daily-transactions/index.ts` (uses service role; computes + upserts closings for yesterday).
- **Insert SQL (via insert tool)**: enable `pg_cron`/`pg_net`, schedule daily 00:05 UTC POST to the function.
- **Edit `src/pages/DailyTransactions.tsx`**: new starting-balance source, new synthetic "Closing Balance from …" row, new bottom summary card.

No changes needed to `LogTransactionSheet.tsx` or `AllTransactions.tsx`.

