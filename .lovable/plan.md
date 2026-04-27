# Finalize Dashboard: 4-card layout + role-based logic

Most of the requested behavior is already implemented from prior turns (Salesman block on Daily Transactions, Cash in Hand "N/A" for Salesman, Manager 7-day clamp, scoped chart via `scope` prop, Cash in Hand formula matching Daily Transactions). This plan finalizes the visual layout and the new Total Sales click behavior.

## Changes

### 1. `src/pages/Index.tsx` — restore 4-card layout
- **Remove** the "My Sales" card from the Owner/Manager `summaryCards` array.
- **Restore "Active Staff"** as the 3rd card for Owner/Manager (same as Salesman view).
- Final card order for **Owner/Manager**:
  1. Total Sales (shop-wide) — **clickable → navigates to `/personal-report`**
  2. Cash in Hand (shop-wide formula) — clickable → `/more/daily-transactions`
  3. Active Staff
  4. Short Items → `/short-items`
- Final card order for **Salesman** (unchanged):
  1. Total Sales (personal, scoped by `user_id`)
  2. Cash in Hand → **"N/A"**, not clickable
  3. Active Staff
  4. Short Items
- Keep `isShopScope` logic, manager date clamp, and realtime cash subscription as-is.

### 2. `src/pages/More.tsx` — already correct
"Daily Transactions" is already filtered out for Salesman. No change.

### 3. `src/components/SalesTrendChart.tsx` — already correct
The `scope` prop already drives shop-vs-personal chart data. No change.

### 4. `src/App.tsx` — already correct
`/personal-report` is registered with `BlockSalesman` guard. No change.

### 5. `src/pages/DailyTransactions.tsx` — already correct
Salesman redirect + Manager 7-day calendar clamp already in place. No change.

## Backend / data isolation
Already enforced — no migration needed:
- All queries filter by `pharmacy_id` (RLS already restricts to `get_user_pharmacy_id()`).
- Salesman sales/chart queries add `.eq("user_id", userId)` on the client; RLS additionally prevents cross-pharmacy reads.
- Salesman cannot reach `/more/daily-transactions` or `/personal-report` due to `BlockSalesman` route guard + in-page redirect.

## Cash in Hand formula (Owner/Manager)
Already implemented in `fetchCashInHand` and matches Daily Transactions:
```
startingBalance (from prev day's closing OR pharmacy_settings.starting_cash_balance)
+ cashSalesToday  (= salesToday − duesToday)
+ dueReceived
+ cashInInvestments
− paymentsToday
```

## Summary of net code changes
Only **`src/pages/Index.tsx`** is edited: swap `My Sales` → `Active Staff` in the Owner/Manager card array, and add `onClick: () => navigate("/personal-report")` to the Total Sales card for Owner/Manager.
