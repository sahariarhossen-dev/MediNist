## Goal

On the Daily Transactions page, the middle "Transactions" list should only show **manual cash flow** entries logged by Owner/Manager. Auto-generated `Medicine Sale` (`sale_cash`) and `Due Payment` (`due_collection`) rows must be hidden from this list, but must still flow into the header totals (Total Sales, Cash Sales, Cash in Hand) and the Daily Closing Summary.

## Scope of change

Single file: `src/pages/DailyTransactions.tsx`

Currently `feedItems` only filters out `due_collection`, so any `cash_transactions` row with category `sale_cash` (e.g. the "Md Sahariar Hossen · Medicine Sale" row in the screenshot) still appears in the middle list. Calculations already live on separate memos (`salesTotal`, `cashSalesTotal`, `dueReceived`, `cashInInvestments`, `totalPayments`, `cashInHand`) that read from `salesRows` and `txs` directly, so tightening the feed filter won't affect any totals.

## Changes

1. **Tighten the feed filter** (`feedItems` memo, ~line 178):
   - Exclude both `sale_cash` and `due_collection` categories.
   - Keep the remaining categories visible: `other_in` (manual cash in / investments), `expense`, `supplier_payment`, `other_out` (manual payments).

   Effective allow-list: `other_in`, `expense`, `supplier_payment`, `other_out`.

2. **Update "See All" link gating** so it stays consistent with the new filter (still based on `feedItems.length > 5`, no logic change needed beyond the filter above).

3. **Update the empty-state copy** (already says "No manual transactions logged for this date." — keep as-is, it now matches the behavior precisely).

4. **No changes** to:
   - `salesRows` query or `salesTotal` (Total Sales card and Closing Summary stay correct).
   - `cashSalesTotal`, `dueReceived`, `cashInInvestments`, `totalPayments`, `cashInHand` formulas.
   - Daily Closing Summary block.
   - `AllTransactions.tsx` page — the "See All" view continues to show the full unfiltered manual ledger including auto entries, since it's the audit view. (If you'd prefer it filtered too, say so and I'll mirror the filter there.)

## Verification

- The "Medicine Sale" row from the screenshot disappears from the middle list.
- Header "Total Sales" still shows ৳963 and "Cash Sales" ৳787.
- "Cash in Hand" remains ৳6,732 (unchanged formula).
- Daily Closing Summary totals unchanged.
- Logging a manual investment/expense via the + button still appears in the list.
