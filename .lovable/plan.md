## Goal
Give Managers the same dashboard as Owners (4 cards + Sales Trend + Top Performers), but restrict the date filter to **Today** and **Last 7 Days** only.

## Changes — `src/pages/Index.tsx`

1. **Treat manager like owner for dashboard rendering**
   - Introduce `const canSeeShopDashboard = isOwner || isManager;`
   - Replace existing `isOwner ? [...] : [...]` summary card logic so the rich 4-card layout, Sales Trend chart, and Top Performers all render when `canSeeShopDashboard` is true.
   - Salesman keeps the existing 2-card minimal view.

2. **Restrict range options for Manager**
   - Build `rangeLabels` dynamically:
     - Owner → `today, 7days, 15days, 30days`
     - Manager → `today, 7days` only
   - Guard `setTimeRange`: if a manager somehow has `15days`/`30days` selected, snap back to `today`.
   - Show the `<Select>` for both owner and manager (currently only owner).

3. **Data fetches already work for both roles**
   - `fetchRangeSales` currently early-returns unless `isOwner`. Change condition to `canSeeShopDashboard` so manager's personal + shop totals populate.
   - `fetchCashInHand` already runs for non-salesmen — no change.
   - `fetchTodayMeta` and `fetchMyTodaySales` already role-agnostic — no change.

4. **Cards for Manager** (same shape as Owner)
   - Card 1: `Today's My Sale` / `My Total Sale` (personal)
   - Card 2: `Cash in Hand` (shop real-time)
   - Card 3: `Active Staff` when Today, else `Total Shop Sale` (will only ever be 7 days for manager)
   - Card 4: `Short Items` (real-time)

5. **Top Performers + Sales Trend**
   - Render for `canSeeShopDashboard`, passing the same `timeRange` so they stay in sync.

## Out of scope
- No DB/RLS changes — sales/cash tables already readable by pharmacy members.
- No edge function changes.
- No styling changes; reuses existing card classes.

## Verification
- Sign in as Manager → dashboard shows 4 cards, chart, leaderboard.
- Dropdown lists only Today / Last 7 Days.
- Switching to 7 Days updates Card 1 title to "My Total Sale", Card 3 to "Total Shop Sale".
- Sign in as Owner → unchanged (all 4 range options visible).
- Sign in as Salesman → unchanged (2-card view).
