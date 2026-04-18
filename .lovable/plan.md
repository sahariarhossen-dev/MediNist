

## Add Cash In / Cash Out entry form to Daily Transactions

A floating "+" button on `/more/daily-transactions` opens a sheet with a form to log either an investment/cash-in or a payment/expense. New entries write to the existing `cash_transactions` table and the page reloads so summary cards and the feed update immediately.

### 1. New component: `LogTransactionSheet.tsx`

A bottom sheet (shadcn `Sheet` with `side="bottom"`) containing a `react-hook-form` + zod-validated form:

- **Description / Source** — text input (`party_name`), required, trimmed, max 100 chars
- **Transaction Type** — shadcn `Select` with two options:
  - `Cash In / Investment` → maps to `direction: "in"`, `category: "other_in"`
  - `Payment / Expense` → maps to `direction: "out"`, `category: "expense"`
- **Amount (৳)** — number input with leading "৳" prefix, required, > 0, max 10,000,000
- **Save** button — full-width, `bg-blue-600 hover:bg-blue-700`, shows loading spinner while saving
- **Cancel** button — ghost variant

On submit:
- Insert into `cash_transactions` with `pharmacy_id`, `user_id`, `occurred_at = selectedDate`, plus the form values
- Toast success/error and close the sheet
- Call `onSaved()` so the page refetches

### 2. Edits to `src/pages/DailyTransactions.tsx`

- Extract the data-loading logic into a `loadData()` function and a `refreshKey` so we can refetch after a save.
- Add a floating "+" FAB at `bottom-6 right-5` (above bottom safe area), `h-14 w-14 rounded-full bg-blue-600 shadow-lg`, `Plus` icon. Mobile-friendly tap target.
- Render `<LogTransactionSheet date={date} pharmacyId={profile.pharmacy_id} userId={profile.id} open={open} onOpenChange={setOpen} onSaved={loadData} />`
- Visual indicators in the feed already use `ArrowDownLeft` (green) for `in` and `ArrowUpRight` (red) for `out`. To match the request more literally, switch to `Plus` (green) and `Minus` (red) inside the colored circle so it reads as "+ / −" at a glance. Keep the existing `+৳` / `−৳` amount prefix.
- Cards already update from `cash_transactions`: `Cash Received` includes `direction='in'` with categories `sale_cash` or `due_collection` — extend it to include `other_in` so investments count toward Cash Received and Cash in Hand. `Total Payments` already sums all `direction='out'`, so expenses flow in automatically.

### 3. Branding & responsiveness

- Inputs use existing shadcn `Input` / `Select` styling — already neutral; we'll add `focus-visible:ring-blue-500` overrides on the trigger for the brand blue.
- Sheet is `max-w-md mx-auto` so it stays narrow on desktop and edge-to-edge on mobile.
- AppHeader is unchanged (already shared across pages).

### Files

- **New**: `src/components/transactions/LogTransactionSheet.tsx`
- **Edit**: `src/pages/DailyTransactions.tsx` (FAB, refresh wiring, include `other_in` in Cash Received, swap feed icons to Plus/Minus)

No DB migration needed — `cash_transactions` already supports `other_in` and `expense` categories.

