## Root cause

Both `src/pages/DailyTransactions.tsx` and `src/pages/Index.tsx` compute today's starting cash as:

```
prev daily_closings row → net_balance, else → pharmacy_settings.starting_cash_balance
```

The `daily_closings` table is empty (verified via DB query — 0 rows). The scheduled `close-daily-transactions` edge function has not been writing rows (its recent log shows only a boot, no runs), and no one has manually submitted a blind closing. So every day falls back to `starting_cash_balance` (0), and yesterday's ৳666 net never carries forward — even though it's visible on the Daily Transactions page because that screen *computes* it live from raw rows.

## Fix

Stop depending on `daily_closings` for the opening balance. Compute it directly from all activity strictly **before** today's `from` timestamp, using the same formula already used for "today" — so the number is always continuous regardless of whether the cron ran.

Opening balance formula (matches `submit_blind_closing` math):

```
opening = pharmacy_settings.starting_cash_balance
        + max(0, completed_sales_before_today − new_dues_before_today)   // cash portion of sales
        + due_collections_before_today                                    // category=due_collection
        + other_cash_in_before_today                                      // category=other_in
        − payments_before_today                                           // direction=out
```

Then today's Cash in Hand = `opening + todayCashSales + todayDueReceived + todayCashInInvestments − todayPayments` (unchanged).

Because this scans the full history, wrap it in a small shared helper to keep both pages in sync.

### Files to change

1. **New** `src/lib/openingBalance.ts`
   - Exports `async function getOpeningBalance(pharmacyId: string, dayStartISO: string): Promise<number>`.
   - Runs 4 parallel queries with `.lt(...)` on the appropriate timestamp column:
     - `sales.total` where status=completed, created_at < dayStart
     - `customer_ledger.amount` where entry_type='due', occurred_at < dayStart
     - `cash_transactions(direction,category,amount)` where occurred_at < dayStart
     - `pharmacy_settings.starting_cash_balance`
   - Applies the formula above and returns the number.
   - Note on the 1000-row default limit: use `.select(..., { count: 'exact', head: false })` plus paging, or aggregate via successive `.range()` calls. Simpler: fetch only the numeric columns and page in chunks of 1000 until exhausted. (Document the helper as O(history); fine for pharmacy-scale data.)

2. **`src/pages/DailyTransactions.tsx`** (~lines 78–133)
   - Remove the `prevClosingRes` query and the `pharmacy_settings` query from the Promise.all batch.
   - Call `getOpeningBalance(profile.pharmacy_id, from)` instead.
   - `setStartingBalance(opening)`.
   - `previousClosing` state is only used to render the "Yesterday's closing ৳X" line (line ~326). Replace it with `setPreviousClosing({ closing_date: <yesterday>, net_balance: opening })` so that subline still shows the carried-forward value. Keep the existing type.

3. **`src/pages/Index.tsx`** (~lines 163–199)
   - Remove `settingsRes` and `prevClosingRes` from the Promise.all batch.
   - Call `getOpeningBalance(pharmacyId, from)`.
   - `startingBalance = opening`. Rest of the Cash in Hand math stays identical.

4. Keep the realtime channel subscriptions as-is — when a new sale/transaction is inserted today, both pages re-pull and recompute opening from history, which naturally stays correct.

### Out of scope

- No DB migration. The `daily_closings` table and the cron remain useful for audit/blind-close, but are no longer the source of truth for opening balance.
- No change to `submit_blind_closing` or `close-daily-transactions`.
- No change to subscription logic.
