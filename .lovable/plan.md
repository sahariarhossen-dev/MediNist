

## Plan: Dynamic Dashboard with Time Range Filter

### Overview
Replace the static summary cards with a fully functional, database-driven dashboard. Add a dropdown filter (Today / Last 7 Days / Last 15 Days / Last 30 Days) that dynamically queries Supabase and updates all 4 stat cards.

### Changes — `src/pages/Index.tsx`

**1. Add state and data fetching**
- Add `useState` for `timeRange` (default: `"today"`) and card values (`totalSales`, `totalBills`, `activeStaff`, `stockAlerts`)
- Add `useEffect` that runs when `timeRange` or `profile.pharmacy_id` changes
- Compute the start date from the selected range, then run 3 parallel Supabase queries:
  - **Total Sales**: `SELECT SUM(total) FROM sales WHERE pharmacy_id = ? AND status = 'completed' AND created_at >= startDate`
  - **Total Bills**: `SELECT COUNT(*) FROM sales WHERE pharmacy_id = ? AND status = 'completed' AND created_at >= startDate`
  - **Active Staff**: `SELECT COUNT(DISTINCT user_id) FROM sales WHERE pharmacy_id = ? AND created_at >= startDate`
- **Stock Alerts**: Separate query (not time-dependent): `SELECT COUNT(*) FROM medicines WHERE pharmacy_id = ? AND stock_quantity < stock_alert` — uses each product's own `stock_alert` threshold; falls back to `stock_quantity < 5` when `stock_alert` is 0 or null

**2. Replace static dropdown with functional Select**
- Use the existing `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` components from `src/components/ui/select.tsx`
- Options: Today, Last 7 Days, Last 15 Days, Last 30 Days
- On change, update `timeRange` state which triggers the data refetch

**3. Render dynamic values**
- Replace the hardcoded `summaryCards` array with computed values from state
- Total Sales displays with `৳` symbol and `.toLocaleString()`
- Stock Alerts card label changed to "Short Items" per the request

**4. Keep existing styling intact**
- Same card grid, icons, colors, chart, header, and avatar
- No changes to the Hourly Sales Trend chart section

### No database changes needed
All required columns (`status`, `created_at`, `pharmacy_id`, `user_id`, `stock_quantity`, `stock_alert`) already exist in the `sales` and `medicines` tables.

