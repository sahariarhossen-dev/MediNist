## Salesman Dashboard: Add Date Filter + Personal Sales Trend Chart

Single-file change: `src/pages/Index.tsx`. No DB, RLS, or component API changes (the `SalesTrendChart` already supports `scope="personal"`).

### Changes

1. **Show date filter for salesman** — extend gating from `canSeeShopDashboard` to include `isSalesman`. Salesman gets the full 4 options: Today, Last 7 Days, Last 15 Days, Last 30 Days (use `fullRangeLabels`; manager still capped to today/7days).

2. **Range-aware personal data fetch** — generalize `fetchRangeSales` to also run for salesman. For salesman, query is `eq("user_id", userId)` only (no shop totals needed). Track `myRangeInvoices` count from the same query.

3. **Update salesman cards to range-aware**:
   - Card 1 "My Personal Sales" — `isToday ? myTodaySales : myRangeSales`
   - Card 2 "Total Invoices" — `isToday ? myTodayInvoices : myRangeInvoices`
   - Card 3 "Average Sales" — `sales / invoices`, guard divide-by-zero → `৳0`
   - Card 4 "Short Items" — unchanged (real-time, pharmacy-wide)

4. **Show personal Sales Trend Chart for salesman** — render `<SalesTrendChart scope="personal" timeRange={timeRange} pharmacyId=… />` for salesman. Owner/manager keep their `scope="shop"` chart unchanged. (No Top Performers for salesman.)

### Out of scope

- No RLS changes — salesman already can only read their own sales rows per existing policy.
- Owner and Manager dashboards untouched.
