## Dashboard cards — filter-aware logic for Owner

Update `src/pages/Index.tsx` so the 4 summary cards behave differently per selected range, and lock the aggregated view to the Owner (admin) role only.

### Card behavior (Owner only)

| # | Range = Today | Range = 7/15/30 Days |
|---|---|---|
| 1 | **Today's My Sale** — current user's completed sales today | **My Total Sale** — current user's completed sales for the range |
| 2 | **Cash in Hand** — live, ignores range (always today's real-time value) | Same — unchanged by filter |
| 3 | **Active Staff** — distinct sellers today | **Total Shop Sale** — sum of ALL users' completed sales for the range |
| 4 | **Short Items** — live low-stock count | Same — unchanged by filter |

### Implementation

1. **Role gating**
   - Only `admin` (Owner) sees the filter dropdown + aggregated stats, Sales Trend, and Top Sales Performers.
   - Manager and Salesman: hide the range dropdown and render a simplified personal view (Today's My Sale + Short Items), no shop aggregates. Remove the existing manager-range branch.

2. **State split in `Index.tsx`**
   - `myRangeSales` — current user's total for selected range (drives Card 1 when not Today; for Today uses existing `myTodaySales`).
   - `shopRangeSales` — all-users total for selected range (drives Card 3 when not Today).
   - `activeStaffToday` — distinct seller count for today only (drives Card 3 when Today).
   - `cashInHand` — unchanged, always computed for today, **not** re-fetched when `timeRange` changes.
   - `stockAlerts` — unchanged, live.

3. **Fetch logic**
   - Replace `fetchStats` with two effects:
     - `fetchRangeSales(timeRange)` — runs on range change. Queries `sales` filtered by `pharmacy_id`, `status=completed`, `created_at >= start`. Computes both `myRangeSales` (filter by `user_id`) and `shopRangeSales` (sum all) from one query.
     - `fetchTodayMeta()` — runs once / on realtime. Computes `activeStaffToday` (today only) and `stockAlerts`.
   - Keep `fetchCashInHand` exactly as is — never depends on `timeRange`.

4. **Card rendering**
   - Build `summaryCards` dynamically based on `timeRange === "today"`:
     - Card 1 title: `Today's My Sale` | `My Total Sale`; value uses `myTodaySales` | `myRangeSales`.
     - Card 3 title/value: `Active Staff` (count) | `Total Shop Sale` (৳ amount); icon switches `Users` ↔ `TrendingUp`.
   - Cards 2 & 4 unchanged.

5. **Sales Trend + Top Performers**
   - Already receive `timeRange` — confirm they re-render on change. No code change unless they currently ignore range.

6. **Realtime**
   - Existing channel debounce calls `fetchCashInHand` + `fetchStats` + `fetchMyTodaySales`. Replace `fetchStats`/`fetchMyTodaySales` with `fetchRangeSales` + `fetchTodayMeta`. Cash in Hand keeps live updates on `sales`/`cash_transactions`/`customer_ledger` changes for today.

### Files touched
- `src/pages/Index.tsx` (only)

No DB changes, no other components.
