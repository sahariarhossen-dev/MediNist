# Role-Based Dashboard & Personal Report

Apply different chart scope, time-range filter options, and summary cards per role. Add a new "My Sales" personal report page for Owner/Manager.

## Behavior Matrix

| Capability | Owner | Manager | Salesman |
|---|---|---|---|
| Sales-trend chart scope | Shop-wide (all users) | Shop-wide (all users) | Personal only (own user_id) |
| Time-range options | Today / 7 / 15 / 30 days | Today / 7 days only | Today / 7 / 15 / 30 days |
| Total Sales card | Shop-wide | Shop-wide | Personal only |
| Cash in Hand card | Shop-wide value | Shop-wide value | "N/A" (unchanged) |
| My Sales card | Visible → /personal-report | Visible → /personal-report | Hidden |
| Active Staff / Short Items | Shop-wide | Shop-wide | Shop-wide (unchanged) |

Role mapping uses existing `profile.role` values: `admin` (=Owner), `manager`, `salesman`.

## Changes

### 1. `src/pages/Index.tsx`
- Compute `isOwner = role === 'admin'`, `isManager = role === 'manager'`, `isSalesman = role === 'salesman'`.
- `rangeLabels`: build dynamically — managers get `{ today, 7days }` only. If a manager somehow has `15days`/`30days` selected, clamp back to `7days` in a `useEffect`.
- `fetchStats` Total Sales query:
  - Owner/Manager: drop the `.eq("user_id", userId)` filter (shop-wide).
  - Salesman: keep `.eq("user_id", userId)` (personal).
- Replace the 4-card grid:
  - Owner/Manager cards: **Total Sales (shop)**, **Cash in Hand**, **My Sales** (new, navigates to `/personal-report`), **Short Items**. Drop "Active Staff" to keep the 2×2 grid clean (or keep and make 2×3 — see Open Question).
  - Salesman cards: unchanged set with personal Total Sales + frozen Cash in Hand.
- Pass a new `scope` prop to `<SalesTrendChart>`: `"shop"` for owner/manager, `"personal"` for salesman.

### 2. `src/components/SalesTrendChart.tsx`
- Add prop `scope: "shop" | "personal"`.
- In `fetchChartData` and `handlePointClick`, only apply `.eq("user_id", userId)` when `scope === "personal"`.
- Add a realtime subscription on `sales` filtered by `pharmacy_id` so shop-wide chart updates live when any teammate logs a sale (debounced 250ms, like Index).

### 3. New page `src/pages/PersonalReport.tsx`
- Route: `/personal-report`. Guard so only `admin` and `manager` can access (redirect salesman → `/`).
- Scoped strictly to `auth.uid()` + `pharmacy_id`.
- Time-range selector (manager limited to today/7days, owner full 30d).
- Sections:
  - KPI cards: My Total Sales (৳), My Invoices (count), Avg. Invoice Value, My Discounts Given.
  - Personal hourly/daily sales trend (reuses `SalesTrendChart` with `scope="personal"`).
  - Top 5 medicines I sold (join `sale_items` via my `sales.id`).
  - My recent invoices list (last 10) with link to `/invoice/:id`.
- Uses `AppHeader` + standard page chrome; back button to `/`.

### 4. `src/App.tsx`
- Register `/personal-report` route.
- Add a `BlockSalesman`-style guard wrapping it (redirect salesman → `/`).

## Data Isolation Notes

- All queries continue to filter `pharmacy_id = profile.pharmacy_id`; RLS already enforces this server-side.
- "Personal" scope adds `user_id = auth.uid()` client-side — RLS allows shop-wide reads, so the client filter is the enforcement layer for Salesman views (matches existing pattern in `SalesTrendChart`). No DB migration needed.
- Manager 7-day limit is a UI restriction (consistent with Daily Transactions); RLS does not gate by date.

## Open Question

The Owner/Manager dashboard now needs 5 cards (Total Sales, Cash in Hand, My Sales, Active Staff, Short Items). Options:
- **A** — drop "Active Staff" from the dashboard (still available elsewhere).
- **B** — keep all 5 in a 2-col grid (one row has a single card).
- **C** — move "Active Staff" + "Short Items" into a compact secondary row.

I'll go with **A** (drop Active Staff from main grid) unless you prefer otherwise.
