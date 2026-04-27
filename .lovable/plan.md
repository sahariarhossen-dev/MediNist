# Staff Monitoring UI/UX

A focused Owner-facing monitoring page accessible from the Dashboard, with a real-time Pulse Feed, live staff presence, and an owner-only Discrepancy Report.

## 1. Dashboard Entry

In `src/pages/Index.tsx`, make the **Active Staff** card clickable (Owner only) by adding `onClick: () => navigate("/staff-monitoring")` to its summary card definition. Other roles remain non-interactive (no navigation).

## 2. New Route

In `src/App.tsx`:
- Import `StaffMonitoring` page.
- Add route: `/staff-monitoring` wrapped in `ProtectedRoute` + `AppLayout` (so bottom nav shows). The page itself enforces owner-only access and redirects others to `/more`.

## 3. New Page: `src/pages/StaffMonitoring.tsx`

Owner-only page (`profile.role === "admin"`). Layout uses the established mobile shell (`bg-[#F4F6FB]`, `max-w-md mx-auto`, sticky header with back arrow), generous spacing, and clean typography matching `StaffActivity.tsx`.

### Sections (top to bottom)

**A. Header**
- Sticky white header with back button + title "Staff Monitoring" + subtle subtitle "Real-time activity & presence".

**B. Active Staff strip**
- Loads `profiles` for the pharmacy (id, full_name, avatar_url, role, last_seen) via a new `get_pharmacy_member_presence()` RPC (security definer) so non-admin profile rows are exposed only via this controlled function, returning the same fields plus `last_seen`.
  - *Why an RPC*: the existing `profiles` SELECT policy only allows users to view their own row. We need the owner to see every member's `last_seen`. RPC keeps the table policy intact.
- Renders a horizontal scroll row of avatar chips. Each chip:
  - Avatar (initials fallback)
  - Small green pulsing dot (top-right) if `last_seen` is within the last 5 minutes; gray dot otherwise.
  - Name + "Active now" / "Active 12m ago" caption.
- Re-evaluates "active" every 30s via a tick interval.

**C. Discrepancy Report (Owner Insight) — owner only, already enforced by page**
- Card titled "Discrepancy Report" with a small "Owner only" pill.
- Pulls last 7 days of `daily_closings` where `closing_type = 'manual'` and `discrepancy IS NOT NULL`, joined with member names from the presence map.
- For each row shows: date, staff name, Declared, System Total, and **Variance** (color-coded: red for shortage, amber for surplus, green for exact match), plus optional notes.
- Empty state: "No discrepancies recorded".
- Minimalist: white card, 1px dividers, lots of padding, tabular-nums for amounts.

**D. The Pulse Feed (Timeline)**
- Real-time vertical timeline driven by `staff_activity_logs` (last 100 entries, current pharmacy), already in place from the audit logging system.
- Visual: a left vertical guide line with circular icon nodes; each node colored per category:
  - **Green** — sales (`sale_create`, `payment_received`)
  - **Red** — expenses (`transaction_create` where direction is `out` per metadata; also `sale_delete`, `transaction_delete`, `closing_discrepancy`)
  - **Blue** — logins (`login`, `logout`)
  - **Amber** — edits/overrides (`sale_update`, `transaction_update`, `override_request`)
  - **Indigo** — closings
- Each item: icon node • staff name + relative time on top row • description on second row • amount on right (when present, tabular-nums, in BDT).
- Uses Supabase realtime channel on `staff_activity_logs` filtered by `pharmacy_id` to prepend new entries instantly.
- Filters (compact pill row above feed): All / Sales / Expenses / Logins.
- Empty state: subtle illustration with "Quiet day so far".

### Design tokens
- Background `#F4F6FB`, cards white with `rounded-2xl shadow-sm`.
- Typography: `text-base` titles, `text-xs` muted labels, `tabular-nums` for currency.
- Generous `p-4`/`gap-4` spacing, dividers `divide-gray-100`.
- Use lucide icons: `ShoppingCart`, `Wallet`, `LogIn`, `LogOut`, `AlertTriangle`, `LockKeyhole`, `ShieldAlert`, `HandCoins`, `Trash2`, `Pencil`.

## 4. Database

Add one migration:

```sql
create or replace function public.get_pharmacy_member_presence()
returns table(user_id uuid, full_name text, avatar_url text, role text, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.role, p.last_seen
  from public.profiles p
  where p.pharmacy_id = public.get_user_pharmacy_id();
$$;
```

This is read-only and scoped to the caller's pharmacy via `get_user_pharmacy_id()`, so it's safe to expose to all members but the page itself only renders for owners.

## 5. Files

**Create**
- `src/pages/StaffMonitoring.tsx`
- `supabase/migrations/<ts>_member_presence_rpc.sql`

**Edit**
- `src/pages/Index.tsx` — make Active Staff card clickable for owners.
- `src/App.tsx` — register `/staff-monitoring` route.

## Out of scope
- No changes to existing `StaffActivity` page (kept as the detailed audit log).
- No new write paths; presence is read-only and already updated by `touch_last_seen()`.
