# Standardize Advances as Recurring Transactions

## Concept Shift

Today, the **Advances** field stores a single cumulative number on `staff_settings.advances` and is overwritten each save. We move to a transaction-driven model:

- **Source of truth** for advances = `cash_transactions` rows tagged for that staff member.
- The input field is always blank — saving creates one new transaction row.
- "Total Advances (Current Month)" is computed by summing those rows for the month.
- "Net Payable" uses this monthly sum (not the stale `staff_settings.advances` column).

No DB schema change is required. We identify a staff advance transaction by:
`category = 'expense'` AND `note LIKE 'STAFF_ADVANCE:<userId>%'`

Storing the staff `user_id` inside `note` lets us filter precisely without a migration. `party_name` stays human-friendly: `Staff Advance: <Name>`.

## Changes

### 1. `src/pages/StaffPerformanceDetails.tsx` (Admin view)

**Earnings Summary card — edit mode:**
- Replace the single `advances` numeric field with:
  - Read-only label: `Total Advances Taken (This Month): − ৳{monthAdvanceTotal}` in rose-600.
  - A **"New Advance"** input that defaults to empty (`""`), placeholder `e.g. 500`.
  - Save flow:
    1. Validate amount > 0 (skip insert if blank/0, but still allow basic salary / commission % updates).
    2. Show the existing confirmation dialog: "This will deduct ৳X from the shop's current balance…"
    3. On confirm, insert a row into `cash_transactions`:
       - `direction: 'out'`, `category: 'expense'`
       - `party_name: 'Staff Advance: <Name>'`
       - `amount: <new advance>`
       - `note: 'STAFF_ADVANCE:<userId> | Cash Advance - Approved by Owner'`
       - `occurred_at: now()`
    4. Clear input back to empty, refresh `monthAdvanceTotal`.
- Remove the persisted `advances` column from save payloads (we leave the column in DB but stop writing to it). Basic salary and commission % continue to upsert into `staff_settings`.

**Display mode (read-only summary):**
- "Advances" line uses `monthAdvanceTotal` from transactions, shown as `− ৳X` in red.
- "Net Payable" = `basic_salary + commission − monthAdvanceTotal`.

**"View in Transactions →" link:**
- Replace the `navigate('/more/all-transactions')` call with opening a new **Staff Advances modal** (Sheet/Dialog) — see section 3.

**Data fetch:**
- Add a query alongside the existing month sales fetch:
  ```
  select id, amount, occurred_at, note
  from cash_transactions
  where pharmacy_id = ? and category = 'expense'
    and note like 'STAFF_ADVANCE:<userId>%'
    and occurred_at >= monthStart
  ```
  Sum into `monthAdvanceTotal`; keep the rows for the modal.

### 2. `src/pages/Profile.tsx` (Personal view)

- Replace `advances` (from `staff_settings`) with `monthAdvanceTotal` queried the same way for the logged-in user.
- Earnings card:
  - "Advances (This Month)" row in red: `− ৳X`.
  - Net Payable = `basic_salary + commission − monthAdvanceTotal`.
- Add a small "View advance history" link that opens the same Staff Advances modal in read-only mode.

### 3. New component: `src/components/staff/StaffAdvancesSheet.tsx`

A bottom sheet (`<Sheet side="bottom">`) used by both Profile and StaffPerformanceDetails.

**Header:** `{Staff Name}'s Advances — {Month YYYY}`

**Body — receipt-style list** (clean MediNist aesthetic, lots of whitespace):
```
─────────────────────────────────
12 Apr 2026 · 3:42 PM
Cash Advance - Approved by Owner
                          − ৳500
─────────────────────────────────
05 Apr 2026 · 11:10 AM
Cash Advance - Approved by Owner
                          − ৳1,000
─────────────────────────────────
```
Empty state: "No advances taken this month."

**Footer (sticky):**
```
Total Monthly Advance        − ৳1,500
```
(rose-600, bold, tabular-nums)

Props: `{ open, onOpenChange, staffName, userId, pharmacyId }`. Component fetches its own rows on open.

### 4. Math summary

Across both pages, the canonical formula becomes:
```
commission   = monthSales × commission_percent / 100
totalAdvances = Σ cash_transactions (this month, STAFF_ADVANCE:<userId>)
netPayable   = basic_salary + commission − totalAdvances
```

### 5. Cleanup

- Stop writing `staff_settings.advances` (leave column in place; harmless legacy data).
- Remove the `advances` field from the `StaffSettings` interface usage in save payloads (keep type for backward read compatibility but ignore the value).

## Out of scope

- No DB migration. No RLS change (existing `cash_transactions` SELECT policy already lets pharmacy members view rows, and the staff-self filter is enforced in the query via `note` pattern + RLS).
- No changes to AllTransactions page.
- No edit/delete UI for past advance entries (only admins can delete via existing AllTransactions UI if needed).
