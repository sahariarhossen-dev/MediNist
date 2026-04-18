

## Daily Transactions Page

A new `/more/daily-transactions` page for daily cash tallying, linked from the More menu.

### 1. Database (new migration)

Create three new tables (multi-tenant via `pharmacy_id`, RLS scoped to user's pharmacy):

- **`cash_transactions`** — unified ledger of every cash movement
  - `id`, `pharmacy_id`, `user_id`, `created_at`, `occurred_at` (timestamptz)
  - `direction` (`'in' | 'out'`)
  - `category` (`'sale_cash' | 'due_collection' | 'supplier_payment' | 'expense' | 'other_in' | 'other_out'`)
  - `party_name` (customer/supplier/vendor)
  - `amount` (numeric), `note` (text), `sale_id` (uuid, nullable — links to `sales` for cash sales)
- **`customer_dues`** — open dues from credit sales
  - `id`, `pharmacy_id`, `sale_id`, `customer_name`, `amount_due`, `amount_paid`, `created_at`
- **`pharmacy_settings`** — one row per pharmacy
  - `pharmacy_id` (PK), `starting_cash_balance` (numeric, default 0), `updated_at`

RLS: `ALL` policies using `pharmacy_id = get_user_pharmacy_id()` (matches existing patterns). `cash_transactions` insert also requires `user_id = auth.uid()`.

### 2. Route & navigation

- Add route `/more/daily-transactions` in `src/App.tsx` (protected, no `AppLayout` since it's a sub-page like Inventory).
- Add a new "Daily Transactions" menu item in `src/pages/More.tsx` (icon: `Wallet`, teal accent) above "Shop Profile".

### 3. Page layout (`src/pages/DailyTransactions.tsx`)

```text
┌─────────────────────────────────┐
│ AppHeader (shared, identical)   │
├─────────────────────────────────┤
│ ← Daily Transactions   📅 18Apr │  ← back arrow + title + date picker (Popover+Calendar)
├─────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐         │
│ │TotSales │ │CashRecvd│  blue   │
│ └─────────┘ └─────────┘         │
│ ┌─────────┐ ┌─────────┐         │
│ │TotPaymts│ │TodayDue │  teal   │
│ └─────────┘ └─────────┘         │
├─────────────────────────────────┤
│ Cash in Hand: ৳X,XXX  (subtle)  │
├─────────────────────────────────┤
│ Transaction Feed                │
│ ⬆🟢 Customer A  Medicine Sale   │
│       10:24 AM        +৳1,200   │
│ ⬇🔴 Supplier X  Supplier Pay    │
│       11:10 AM        −৳5,000   │
│   ...scrollable list...         │
└─────────────────────────────────┘
```

Back arrow uses `navigate("/more")`. Date picker uses existing shadcn `Calendar` + `Popover` (per project's datepicker pattern with `pointer-events-auto`).

### 4. Data logic

For the selected date (default: today), fetch in parallel:
- All `sales` rows where `status='completed'` (for Total Sales and Cash Received from sales).
- All `cash_transactions` rows for the date (drives the feed and aggregates).
- All `customer_dues` rows created on that date (for Today's Due).
- `pharmacy_settings.starting_cash_balance`.

Calculations:
- **Total Sales** = sum of `sales.total` (all completed sales — cash + credit)
- **Cash Received** = sum of `cash_transactions` where `direction='in'` AND category in (`sale_cash`, `due_collection`)
- **Total Payments** = sum of `cash_transactions` where `direction='out'`
- **Today's Due** = sum of `customer_dues.amount_due − amount_paid` for that date
- **Cash in Hand** = `starting_cash_balance + cashReceived − totalPayments`

Feed: merge `cash_transactions` (sorted by `occurred_at desc`), display per spec — green up arrow for `in`, red down arrow for `out`, party name, category label, formatted time, amount in bold with ৳.

Note: cash sales created via the existing `CreateSale` flow don't yet auto-write to `cash_transactions`. For now this page will read whatever is in `cash_transactions`; wiring sales to auto-create a `sale_cash` ledger entry is a follow-up step (the user can flag it next). Until then, sales totals show correctly but Cash Received only reflects manually-logged entries — I'll surface this clearly with an empty-state hint and we can add the auto-link in a follow-up.

### 5. UI/UX

- Brand-consistent: blue (`#2463eb` / `bg-blue-100 text-blue-600`) and teal (`bg-teal-100 text-teal-600`) cards matching existing dashboard cards.
- White cards, `rounded-2xl`, generous `space-y-3` between feed items, `max-w-md mx-auto` mobile-first.
- Header is the shared `<AppHeader />` — identical to Dashboard.
- No print/export FAB (per your answer — history persists in DB and can be downloaded later, same pattern as Sales page).

### Files

- **New migration**: `cash_transactions`, `customer_dues`, `pharmacy_settings` + RLS
- **New**: `src/pages/DailyTransactions.tsx`
- **Edit**: `src/App.tsx` (route), `src/pages/More.tsx` (menu item)

