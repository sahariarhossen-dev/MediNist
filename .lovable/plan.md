## Goal

On the **Daily Transactions** page, every user (Owner, Manager, Salesman) sees identical pharmacy-wide totals. Salesmen can view but cannot create/edit transactions. The main **Dashboard** "Total Sale" stays user-scoped (unchanged from previous work).

## Changes

### 1. `src/pages/DailyTransactions.tsx` — pharmacy-wide metrics

- Remove the `.eq("user_id", profile.id)` filter from the `sales` query so totals include every user's completed sales for the selected date.
- All other queries (`cash_transactions`, `customer_ledger`, `pharmacy_settings`, `daily_closings`) are already pharmacy-scoped — no change needed.
- Result: Total Sales, Cash Sales, Total Payments, Today's Due, and Cash in Hand become identical for every member of the pharmacy.

### 2. `src/pages/DailyTransactions.tsx` — role gating for write actions

- Treat `profile.role === 'salesman'` as **read-only** on this page.
- Hide the floating "+" Log Transaction button and skip mounting `<LogTransactionSheet />` when the role is salesman.
- Owner (`admin`) and Manager continue to see the FAB and can log transactions for today.
- The existing "Read-only · Closed day" badge logic is unchanged; we simply add a parallel role-based gate.

### 3. `src/pages/AllTransactions.tsx` — consistent shop-wide view

- This page already queries by `pharmacy_id` only — no filter change needed. Confirmed it stays shop-wide so the "See All" link from Daily Transactions remains consistent.

### 4. Math verification — Cash in Hand

Current formula in code:
```
cashInHand = startingBalance + cashSalesTotal + dueReceived + cashInInvestments − totalPayments
```

Where:
- `startingBalance` = previous day's `daily_closings.net_balance`, or `pharmacy_settings.starting_cash_balance` if no prior closing (Opening Cash ✓)
- `cashSalesTotal` = `salesTotal − duesOpen` (the cash portion of today's sales ✓)
- `dueReceived` = today's `due_collection` cash-in rows (customers paying old debts ✓)
- `cashInInvestments` = today's `other_in` cash injections
- `totalPayments` = sum of all `direction = 'out'` rows (expenses, supplier payments, other_out ✓)

This matches the requested formula `(All Users' Sales [cash portion] + All Payments-in + Opening Cash) − All Expenses`, plus correctly separates the due portion of sales (no cash changes hands at sale time) and adds it back when actually collected. Once step 1 makes the queries shop-wide, the math automatically reflects all users.

No formula change required — only the data scope changes.

### 5. Dashboard — unchanged

`src/pages/Index.tsx` keeps its existing `.eq("user_id", profile.id)` scope on the "Total Sale" KPI and personal "Cash in Hand" so each user still tracks their own performance from the home screen.

## Files Edited

- `src/pages/DailyTransactions.tsx` — drop user_id filter on sales query; gate FAB + sheet behind non-salesman role.

No database, RLS, or edge-function changes. RLS already permits all pharmacy members to SELECT shop-wide totals; the salesman write block is a UI guard layered on top of existing INSERT policies.
