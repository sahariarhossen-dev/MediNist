## Goal

Reframe the Dashboard's primary sales card as a personal-only metric (today's sales for the logged-in user) while keeping shop-wide filtering on the rest of the Dashboard. Allow Owners and Managers to filter their personal report for the full last 30 days, independent of the Manager's 7-day cap on shop-wide data.

## Changes

### 1. `src/pages/Index.tsx` — "Total Sales" becomes "Today's My Sale"

- Add a second stat fetch dedicated to the logged-in user, scoped to today only:
  - Filter: `pharmacy_id = profile.pharmacy_id`, `user_id = profile.id`, `status = 'completed'`, `created_at >= startOfDay(today)`, `<= endOfDay(today)`.
  - Store as `myTodaySales` in state.
  - Re-fetch on the same realtime `sales` channel that already drives Cash in Hand.
- The existing shop-scope `totalSales` query (driven by the dashboard time-range selector) still powers Active Staff and stays in place — but it is no longer surfaced on the 4-card grid for Owner/Manager. (Salesman already only sees their own data in that query.)
- First card in the 4-card grid (all roles):
  - Title: **"Today's My Sale"**
  - Value: `৳{formatBDT(myTodaySales)}` for everyone (Owner, Manager, Salesman) — always personal, always today.
  - `onClick` for Owner/Manager → `navigate("/personal-report")`.
  - For Salesman: no navigation (card stays static, matching existing salesman behaviour).
- Other 3 cards unchanged: Cash in Hand (shop-wide formula for Owner/Manager, "N/A" for Salesman), Active Staff, Short Items.
- Dashboard time-range selector keeps current behaviour:
  - Owner: today / 7 / 15 / 30 days.
  - Manager: today / 7 days only (existing clamp stays).
  - The selector now only affects Active Staff and the shop-wide Sales Trend chart for Owner/Manager (and the personal chart for Salesman). It no longer drives the first card.

### 2. `src/pages/PersonalReport.tsx` — Manager gets full 30-day range

- Remove the `managerRangeLabels` restriction on this page. Both Owner and Manager use `fullRangeLabels` (today / 7 / 15 / 30 days).
- Drop the `useEffect` that clamps the manager's range. The page is personal data only, so the 7-day shop-wide rule does not apply here.
- Salesman is already blocked from this route by the existing `BlockSalesman` guard in `App.tsx` — no change needed there.

### 3. Preserved behaviour (no code changes required, just verifying)

- `src/pages/More.tsx`: Daily Transactions still hidden for Salesman.
- `src/pages/DailyTransactions.tsx` + `src/App.tsx`: Manager 7-day clamp + Salesman route guard intact.
- `src/components/SalesTrendChart.tsx`: `scope="shop"` for Owner/Manager Dashboard, `scope="personal"` for Salesman Dashboard and Personal Report.
- Cash in Hand formula on the Dashboard already mirrors Daily Transactions (starting balance + cash sales + dues received + investments − payments) and refreshes via realtime — kept as-is so the ৳8,212 stays in sync.

## Files touched

- Edit `src/pages/Index.tsx`
- Edit `src/pages/PersonalReport.tsx`

No backend / RLS changes. All new queries are already covered by existing `pharmacy_id` + `user_id` row-level policies on `sales`.