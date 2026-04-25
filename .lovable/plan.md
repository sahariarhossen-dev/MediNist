## Refine Daily Transactions Accounting & Summary

Recompute the day's accounting so cash and credit are tracked separately, hide due-collection rows from the operational feed, and surface a dedicated "Due Payment Received" summary.

### 1. New accounting model (`src/pages/DailyTransactions.tsx`)

Compute these from the existing data sources (no schema change):

- **Total Sales** = sum of every completed `sales.total` for the day (cash sales + due sales together).
- **Today's Due** = sum of `customer_ledger.amount` where `entry_type = 'due'` for the day. Already loaded via `duesOpen`.
- **Cash Sales (today)** = `Total Sales − Today's Due` (clamped at 0). The current variable `cashSalesTotal` already does this.
- **Due Received (today)** = sum of `cash_transactions.amount` where `direction='in'` and `category='due_collection'`. New derived value.
- **Cash In / Investments (today)** = sum of `cash_transactions.amount` where `direction='in'` and `category='other_in'` (drop `sale_cash` and `due_collection` from this bucket).
- **Total Payments (today)** = sum of `cash_transactions.amount` where `direction='out'` (unchanged).
- **Cash in Hand** = `startingBalance + cashSalesTotal + dueReceived + cashInInvestments − totalPayments`. This matches the requested formula and avoids double-counting due sales.

### 2. Summary cards (top grid)

Keep the 2×2 grid, recolored as today, but with this content:

- Total Sales (cash + due) — blue
- Cash Sales — blue-soft (replaces "Cash Received", which conflated dues + sales + collections)
- Today's Due — teal-soft
- Total Payments — teal

Below the grid, add a **new full-width "Due Payment Received" card** (green accent, `bg-green-50 text-green-700`, wallet/inbox icon) showing the day's `dueReceived` total. Sits between the summary grid and the existing "Cash in Hand" card so it's visually distinct from operational summaries.

The "Cash in Hand" card stays in place and uses the new formula.

### 3. Transactions feed filtering

The "Transactions" list currently shows every `cash_transactions` row. Change `feedItems` to exclude `category='due_collection'` rows so the feed shows only operational entries: `other_in` (Cash In / Investment) and `direction='out'` (Payments / Expenses). The "See All" link continues to navigate to `/more/all-transactions`, which keeps the unfiltered history.

The "Closing Balance from … (Carried Forward · Opening)" row at the top of the feed stays unchanged.

### 4. Daily Closing Summary (bottom card)

Replace the four rows with:

- Total Sales (cash + due) — green `+`
- Total Cash In (investments only, i.e. `other_in`) — green `+`
- Total Payments (expenses only) — red `−`
- **Total Due Received** (new) — green `+`

Net Cash Balance line at the bottom continues to show `cashInHand` using the new formula.

### 5. Visual consistency

- Greens for in/received, reds for out/payments — already the convention.
- Reuse existing `SummaryCard` / `SummaryRow` components; add a `green` / `green-soft` tone variant to `SummaryCard` for the new "Due Payment Received" card.
- No changes to `LogTransactionSheet`, `ReceivePaymentSheet`, schema, RLS, or `close-daily-transactions` edge function — those continue to record data exactly as today; only the read-side aggregation on this page changes.

### 6. Files

- **Edit only**: `src/pages/DailyTransactions.tsx` (recompute aggregates, filter feed, add new summary card + closing row, add green tone to `SummaryCard`).
- **Unchanged**: every other page, every component, the database, RLS, and the nightly closing job (which already accounts for `due_collection` as cash-in inside its `totalCashIn` and uses `Math.max(0, totalSales − totalDue)` for the cash portion — semantically equivalent to the new on-screen formula).
