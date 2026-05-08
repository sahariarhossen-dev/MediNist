## Top Sales Performers — Daily Leaderboard

Add a new "Top Sales Performers" card on the dashboard (`src/pages/Index.tsx`), shown directly below the `SalesTrendChart`. Visible only to admins (owners) and managers — salesmen never see it and never fetch the data.

### Component

New file: `src/components/TopSalesPerformers.tsx`

- Props: `pharmacyId: string | undefined`
- On mount / when `pharmacyId` changes, fetches today's sales:
  - `sales` rows where `pharmacy_id = pharmacyId`, `status = 'completed'`, `created_at` between today's start/end (local day, matching existing dashboard pattern using `startOfDay`/`endOfDay` from `date-fns`).
  - Selects `user_id, total`.
  - Aggregates client-side: sum `total` grouped by `user_id`.
  - Resolves names via the existing `get_pharmacy_member_names` RPC (already in the project) to map `user_id → full_name`. This avoids any new RLS surface and keeps the call cheap.
  - Sorts descending by total, keeps top 5.
- Subscribes to realtime `sales` inserts/updates filtered by `pharmacy_id` (mirrors the existing dashboard channel pattern), debounced refresh.

### UI

Card styled like existing dashboard cards (`bg-white rounded-xl shadow-sm` inside `Card`, padded, in `px-page`):

- Header row: title "Top Sales Performers" + small subtitle "Today".
- List rows:
  - Left: rank badge.
    - Rank 1 → `<Crown className="text-yellow-500" />`
    - Rank 2 → `<Crown className="text-gray-400" />`
    - Rank 3+ → muted circle with the rank number.
  - Middle: full name, `truncate`, `flex-1 min-w-0`.
  - Right: `৳{formatted}` using existing `formatBDT` style (`Intl.NumberFormat('en-IN')`), `tabular-nums`, `whitespace-nowrap`.
- Loading: 3 skeleton rows (`Skeleton` from `@/components/ui/skeleton`).
- Empty: centered muted text "No sales data yet for today".

### Integration in `src/pages/Index.tsx`

- Compute `const canSeeLeaderboard = isOwner || isManager;` (owner = `admin`, manager = `manager`).
- After `<SalesTrendChart .../>`, render `{canSeeLeaderboard && <TopSalesPerformers pharmacyId={profile?.pharmacy_id} />}`.
- Salesmen: component is not mounted → no fetch happens.

### Security

- RLS on `sales` already enforces: admins/managers see all pharmacy sales, salesmen see only their own. Since the component only renders for admin/manager, the query returns the full pharmacy dataset for them.
- Defensive: the component itself also early-returns null if `pharmacyId` is falsy.

### Out of scope

- No DB migration (existing schema and RLS are sufficient).
- No changes to the existing summary cards, chart, or business logic.
