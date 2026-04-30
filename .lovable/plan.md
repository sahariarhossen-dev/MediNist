## Goal
Wire the Admin's "Earnings Summary" editor on `StaffPerformanceDetails` to the shop's central cash flow, and surface remaining salary on the staff's own `Profile`.

## What changes

### 1. Commission % (already partially done)
- Commission % field already exists in `staff_settings` and the editor in `StaffPerformanceDetails.tsx`. Keep as is — confirm it's saved on "Save" (it already calls `saveSettings({ commission_percent })`) and used as `(monthSales * commission_percent) / 100`.
- No DB schema change needed.

### 2. Automated Advance → cash transaction
When the Admin edits "Advances" and clicks Save in `StaffPerformanceDetails.tsx`:

1. Compute `delta = newAdvances - oldAdvances`.
2. If `delta > 0`, show an AlertDialog:
   > "This will deduct ৳{delta} from the shop's current balance. Do you want to proceed?"
3. On confirm:
   - Upsert `staff_settings` with the new `advances`.
   - Insert into `cash_transactions`:
     - `pharmacy_id`, `user_id = auth.uid()` (the admin who logs it)
     - `direction = 'out'`
     - `category = 'expense'` (matches existing schema; no new enum value needed)
     - `party_name = "Staff Advance: {Staff Name}"`
     - `amount = delta`
     - `note = "Advance paid on {YYYY-MM-DD}"`
     - `occurred_at = now()`
   - On success toast: "Advance recorded — ৳{delta} deducted from balance."
4. If `delta <= 0` (admin lowered/kept advances), just update `staff_settings` without creating a transaction. Show an info toast.

Because `cash_transactions` rows with `direction='out'` are already aggregated by `Index.tsx`, `DailyTransactions.tsx`, `AllTransactions.tsx`, and `submit_blind_closing`, the shop's running balance and transaction history pick this up automatically — no extra wiring.

### 3. "View in Transactions" link
Next to the Advances input (edit mode) and next to the Advances row (read mode), add a small text link `View in Transactions →` that navigates to `/transactions` (the existing `AllTransactions` page).

### 4. Remaining Salary on staff's own Profile
In `src/pages/Profile.tsx`:
- Also fetch `basic_salary` and `advances` from `staff_settings` (currently only `monthly_target` and `commission_percent` are read).
- Add a compact "Earnings This Month" card under the analytics grid showing:
  - Basic Salary
  - Commission ({pct}%) = computed
  - Advances (− amount)
  - **Remaining Salary** = `basic_salary + commission − advances`
- Read-only for staff (no edit pencil) — admins continue to edit on the Manage Staff detail page.

### 5. Keep existing UI patterns
- Use shadcn `AlertDialog` for the confirmation popup (already in `src/components/ui/alert-dialog.tsx`).
- Reuse `StatCard` / row layout from `PerformanceWidgets` for the new earnings card on Profile.
- Tailwind, rounded-3xl cards, mobile-first — matches the rest of the app.

## Files touched
- `src/pages/StaffPerformanceDetails.tsx` — confirmation dialog, auto-create cash_transaction on advance increase, "View in Transactions" link.
- `src/pages/Profile.tsx` — fetch `basic_salary` + `advances`, render Remaining Salary card.

## No DB migration required
`cash_transactions` already supports `direction='out'` + `category='expense'` + `party_name` + `note`, and existing RLS lets any pharmacy member (including admins) insert their own rows. The shop balance, daily totals, and transaction history pages already aggregate these rows.

## Out of scope
- No new "transactions" table — the project's transaction system is `cash_transactions`.
- No reversal logic when an admin reduces the Advances number (we don't auto-create a refund). We can add that later if needed.