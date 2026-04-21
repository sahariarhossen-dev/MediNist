

## Read-only past dates + Cash in Hand on Dashboard

### 1. Daily Transactions — hide FAB on past dates, mark as read-only

In `src/pages/DailyTransactions.tsx`:

- Add a derived flag `isToday = isSameDay(date, new Date())` (using `date-fns`).
- Wrap the floating `+` button + `LogTransactionSheet` so it only renders when `isToday` is true. (Currently the page only allows past or today via `disabled={(d) => d > new Date()}`, so "not today" = past.)
- Show a small read-only indicator near the date popover when `!isToday`: a grey pill `Read-only · Closed day` (lock icon) so users understand why the `+` is gone.
- Transactions are already non-editable in the UI (no edit/delete affordances exist on the cards), so "read-only state" is already true visually. The only mutation entry point is the FAB → hiding it satisfies the requirement. No changes to `LogTransactionSheet`.

### 2. Dashboard — replace "Total Bills" with "Cash in Hand"

In `src/pages/Index.tsx`:

- Remove the `Total Bills` card. Replace it with a `Cash in Hand` card using the `Wallet` icon (lucide-react) and the same blue icon styling as the others.
- The Cash in Hand value must always reflect **today's** net cash, independent of the dashboard's time-range selector (the range filter still drives Total Sales / Active Staff / Short Items as it does today). We'll add a separate fetch for today's cash box that mirrors the formula used on `DailyTransactions`:
  - `startingBalance` = most recent `daily_closings.net_balance` strictly before today, else `pharmacy_settings.starting_cash_balance`, else 0.
  - `salesToday` = sum of `sales.total` where `status='completed'` and `created_at` between today's start/end.
  - `duesToday` = sum of `(amount_due - amount_paid)` from `customer_dues` created today.
  - `cashSalesToday` = `max(0, salesToday - duesToday)`.
  - `manualCashIn` = sum of today's `cash_transactions` where `direction='in'` and category in `('sale_cash','due_collection','other_in')`.
  - `paymentsToday` = sum of today's `cash_transactions` where `direction='out'`.
  - `cashInHand = startingBalance + manualCashIn + cashSalesToday − paymentsToday`.
- Display formatted as `৳<amount>` using the same `Intl.NumberFormat("en-IN")` rounding helper as the Daily Transactions page.
- Make the card clickable → navigates to `/more/daily-transactions`.

### 3. Consistency

Both pages will use the same formula and the same data sources, so the Dashboard "Cash in Hand" card and the Daily Transactions "Cash in Hand" / "Net Cash Balance" rows show the **same value when the Daily Transactions page is viewing today**. (For past dates the Daily Transactions page shows that day's snapshot, which is expected.)

### 4. Files

- **Edit** `src/pages/DailyTransactions.tsx` — `isToday` flag, conditional FAB + sheet, "Read-only" pill on past dates.
- **Edit** `src/pages/Index.tsx` — remove `Total Bills` card, add `Cash in Hand` card with `Wallet` icon, add a today-only cash box fetch (parallel `Promise.all` alongside existing stats), navigate-to handler.

No DB, RLS, or edge function changes required.

