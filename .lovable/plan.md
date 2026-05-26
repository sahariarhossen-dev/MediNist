## Salesman Dashboard Redesign

Update `src/pages/Index.tsx` to render a dedicated 4-card view when `profile.role === 'salesman'`. No other files affected.

### Behavior

- Hide the date filter dropdown (already gated by `canSeeShopDashboard`, salesman is excluded — confirmed).
- Hide the Sales Trend chart and Top Performers (already gated — confirmed).
- Render exactly 4 cards for salesman, today-only scope.

### Cards

1. **Today's Sale** — `৳{myTodaySales}` (already fetched via `fetchMyTodaySales`). Icon: `TrendingUp`. Tap → `/personal-report`.
2. **Total Invoices** — count of completed sales rows by this user today. New state `myTodayInvoices`. Icon: `Receipt` (lucide).
3. **Average Sales** — `myTodaySales / myTodayInvoices`, formatted `৳…`; show `৳0` when invoices === 0 (guard NaN). Icon: `BarChart3`.
4. **Short Items** — reuse existing `stockAlerts` count (already fetched via `fetchTodayMeta`). Icon: `AlertTriangle`. Tap → `/short-items`.

### Data changes

- Extend `fetchMyTodaySales` to also return the row count, or add `myTodayInvoices` state populated from the same query (just use `.length` of the response). No new round-trip.
- Realtime debounced refresh already covers `sales` table changes — invoices count will auto-update.

### Branch

Replace the current salesman fallback (currently shows only 2 cards: "Today's My Sale" + "Short Items") with the 4-card grid above. Owner/Manager branch untouched.

### Out of scope

No DB, RLS, edge function, or styling-system changes. Reuses existing card classes and grid.
