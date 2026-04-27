
## What changes

Sales-related **list / aggregate** views in the UI will only show invoices created by the signed-in user (`auth.uid()`), regardless of whether the user is an admin/owner or a staff member. Database data, RLS policies, and the AI assistant's pharmacy-wide visibility are untouched.

## Why

You want each user — including the owner — to see only their own sales in the day-to-day UI. Cross-user visibility is reserved for the AI assistant, which can still query all pharmacy sales when asked.

## Scope

UI list/aggregate queries to filter:

1. `src/pages/Sales.tsx` — "Sales" history list + today's totals.
2. `src/pages/Index.tsx` — Home dashboard cards: total sales (top KPI) and "Cash in Hand" today's-sales component.
3. `src/pages/DailyTransactions.tsx` — Daily sales rows shown in the transactions sheet/list.
4. `src/components/SalesTrendChart.tsx` — Sales trend chart (today / 7d / 30d) and its drill-down.

Each of these will gain `.eq("user_id", profile.id)` (or `auth.uid()`) on the `sales` query, in addition to the existing `pharmacy_id` filter.

## Explicitly NOT changed

- **`sales` table, RLS policies, columns** — left as-is. All invoices remain in the database, the `user_id` column already records the creator, and the existing pharmacy-wide RLS still permits the owner to read everything when needed.
- **Single-invoice views** — `Invoice.tsx` (open by id) and `CreateSale.tsx` draft loader stay pharmacy-wide, so an owner can still open a specific invoice link if they have one (or if the AI surfaces it).
- **`active staff` count on the dashboard** — this is an aggregate count of distinct creators, not a list of their invoices. We'll keep the pharmacy-wide query for this single metric so the owner still sees how many staff are active. If you'd prefer to remove that card entirely, say so.
- **`supabase/functions/ai-chat`** — uses the service role and queries by `pharmacy_id` only, so the AI already sees all pharmacy sales for the owner. No change needed for "Future AI Access".
- **Customer dues, ledger, cash transactions** — out of scope; this request is specifically about sales/invoices.

## Technical details

For each affected file, add a single chained filter on the existing Supabase query:

```ts
.from("sales")
.select(...)
.eq("pharmacy_id", profile.pharmacy_id)
.eq("user_id", profile.id)        // ← new
...
```

`profile.id` is already available from `useAuth()` in every affected component (it's the authenticated user's id).

`SalesTrendChart.tsx` accepts `pharmacyId` as a prop today; we'll add a similar reliance on the auth context's `profile.id` (or accept it as a prop from the parent). Both `sales` queries inside that file (chart data + drill-down) get the same filter.

No backend migration, no RLS change, no edge-function change. Pure client-side scoping.

## Optional follow-up (not part of this change)

If later you want a toggle on the home dashboard like "Show all staff sales (owner)" we can add a small admin-only switch that drops the `user_id` filter — easy to bolt on once the base behaviour is in place.
