Implement a two-layer guard so no outgoing cash transaction can drive the pharmacy's running cash balance below zero.

## Current state

- Manual cash entries are created in `src/components/transactions/LogTransactionSheet.tsx` via `supabase.from("cash_transactions").insert(...)`.
- `src/pages/DailyTransactions.tsx` computes `cashInHand` as:
  `startingBalance + cashSalesTotal + dueReceived + cashInInvestments - totalPayments`.
- This value is not passed into the sheet, so the sheet has no way to validate an outgoing amount against available cash.
- Other `cash_transactions` inserts (sale cash, due collections, staff advances) are either cash-in or auto-generated; the manual "out" path is the current risk surface.

## Plan

### 1. Frontend guard (LogTransactionSheet.tsx)
- Add `cashInHand: number` prop to `LogTransactionSheet`.
- In `src/pages/DailyTransactions.tsx`, pass the live `cashInHand` value to the sheet.
- Update the Zod schema to conditionally validate `amount` when `type === "out"`:
  - `amount <= cashInHand`
  - Custom error message: "Amount exceeds available Cash in Hand (৳{cashInHand})"
- Render the validation warning below the amount input when the form is invalid for this reason.
- Disable the Save button when the form is invalid or a cash-out exceeds balance.
- If the user attempts to submit anyway, show a toast:
  "Insufficient Cash in Hand. Please deposit cash or record cash sales first."

### 2. Backend guard (database trigger)
- Create a `BEFORE INSERT` trigger on `public.cash_transactions` named `trg_cash_transactions_prevent_negative_balance`.
- The trigger function will:
  - Only act when `NEW.direction = 'out'`.
  - Compute the current running cash balance for `NEW.pharmacy_id` as of `NEW.occurred_at` using the same formula as the frontend:
    - `pharmacy_settings.starting_cash_balance` (or latest daily closing balance, if available)
    - `+ cash sales` (completed sales minus new dues, both before occurred_at)
    - `+ due collections` (cash_transactions in before occurred_at with direction='in' and category='due_collection')
    - `+ other cash in` (direction='in', category='other_in')
    - `- payments` (direction='out')
  - Subtract the new outgoing amount.
  - If the result is `< 0`, raise an exception with a clear message: "Cash in Hand cannot go negative. Available: ৳X, requested: ৳Y".
- This prevents negative cash even if the frontend is bypassed or a race condition occurs.

### 3. Testing
- Add a targeted Deno test for the trigger function in `supabase/functions/tests/` or run it via Supabase SQL tests.
- Manually test the UI flow in the preview: open Daily Transactions, tap +, select Payment/Expense, enter an amount greater than Cash in Hand, and confirm the warning and disabled Save button.
- Try to submit via the backend directly (e.g., through a Supabase SQL read/insert test) and confirm the trigger rejects it.

### 4. Files to modify
- `src/components/transactions/LogTransactionSheet.tsx`
- `src/pages/DailyTransactions.tsx`
- New migration for the `trg_cash_transactions_prevent_negative_balance` trigger.

### 5. Out of scope / notes
- This change intentionally targets only the manual `out` transaction path. Auto-generated sale entries and due collections are cash-in or already constrained by the sale flow and are not affected.
- The backend formula mirrors the existing `getOpeningBalance` and `submit_blind_closing` functions so the three layers stay consistent.