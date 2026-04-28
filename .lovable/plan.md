# Staff Management Dashboard

Transform the current invite-only staff list into a performance hub with per-staff details, badges, targets, commission, and a pharmacy-wide broadcast.

## What you'll see

**Manage Staff section (ShopProfile)**
- A "Top Performer of the Month" card pinned at the top (gold accent, name + total sales).
- An "Internal Broadcast" composer (admin only) with a single active notice — also visible to all staff on the home dashboard as a dismissible banner.
- Staff cards now show: avatar, name (falls back to email), role, this month's sales total, a target progress bar, and a status dot (green = top performer, yellow = average, gray = pending invite).
- Tapping a staff card navigates to `/staff/:userId`.
- Existing invite/resend/revoke/remove controls are preserved.

**Staff Performance Details page (`/staff/:userId`)**
- Header: avatar, full name, role chip, Call + WhatsApp buttons (uses profile.phone).
- Stat cards row: Monthly Sales, Weekly Sales, Commission Earned (auto), Loyalty Score (repeat customers count).
- Circular Monthly Target tracker with current achievement %; admin sees an inline edit pencil to set target.
- Badges grid: Gold Medal (Top Seller of month), Flash (Fastest Biller — most sale count), Star (Customer Favorite — most unique repeat customers). Computed from sales data; earned ones are colored, others are muted.
- Earnings Summary: Basic Salary + Commission − Advances = Net Payable. Admin can edit basic salary, commission %, and advances inline.
- Access: pharmacy admin OR the staff member themselves (read-only for the staff member).

## Database changes

Two new tables (RLS, no triggers, no destructive changes):

1. `staff_settings` — per-staff performance config
   - Columns: `id uuid pk`, `pharmacy_id uuid not null`, `user_id uuid not null`, `monthly_target numeric default 0`, `commission_percent numeric default 0`, `basic_salary numeric default 0`, `advances numeric default 0`, `created_at`, `updated_at`. Unique `(pharmacy_id, user_id)`.
   - RLS: SELECT for any pharmacy member (so the staff member can see their own settings); INSERT/UPDATE/DELETE only for `is_pharmacy_admin()` within the same pharmacy.

2. `pharmacy_broadcasts` — single active notice per pharmacy
   - Columns: `id uuid pk`, `pharmacy_id uuid not null`, `message text not null`, `created_by uuid not null`, `is_active boolean default true`, `created_at`, `updated_at`.
   - RLS: SELECT for any pharmacy member; INSERT/UPDATE/DELETE only for admins of that pharmacy.
   - Convention: only the latest `is_active = true` row per pharmacy is shown; saving a new one deactivates the previous one (handled in app code).

No changes to existing tables.

## Code changes

- **`src/pages/ShopProfile.tsx`** — replace the staff list rendering inside the existing accordion:
  - Add broadcast composer (admin) at top of accordion content.
  - Add Top Performer card.
  - Replace each staff row with an enhanced card (avatar, name, role, monthly total, target progress bar, status dot). Whole card is clickable → `navigate('/staff/:userId')`. Existing invite/resend/revoke/remove icons stay on the right for pending rows.
  - For pending invites (no user_id yet), keep the current minimal row — they have no metrics.
  - Fetch profiles (`full_name`, `avatar_url`, `phone`) for accepted staff via `get_pharmacy_member_names` is name-only; we'll query `profiles` directly filtered by `pharmacy_id` (allowed by existing pharmacy-scoped logic isn't present — fall back to admin-only metric fetch). Since profile RLS only allows self-read, we'll add a new SECURITY DEFINER RPC `get_pharmacy_staff_overview()` returning `(user_id, full_name, avatar_url, phone, role, month_sales, month_count, target)` for the calling pharmacy. This avoids RLS pain and keeps one round trip.

- **`src/pages/StaffPerformanceDetails.tsx`** (new) — full details page.
  - Loads: staff profile (via new RPC `get_pharmacy_staff_profile(_user_id uuid)`), `staff_settings` row (auto-create on first admin save), aggregated sales for current month/week, repeat-customer count, badge winners.
  - Aggregations done client-side from `sales` + `sale_items` + `customer_ledger` filtered by `user_id` and date range.
  - Admin-only inline editors save to `staff_settings`.
  - Guards: redirect non-admin users who aren't viewing their own row.

- **`src/App.tsx`** — add route `/staff/:userId` → `StaffPerformanceDetails` inside `ProtectedRoute` (no `BlockSalesman` so a salesman can view their own page; the page itself enforces who can view).

- **`src/pages/Index.tsx`** — render a small dismissible broadcast banner at the top when an active broadcast exists for the pharmacy. Dismissal stored in `localStorage` keyed by broadcast id.

- **New RPCs (security definer)**:
  - `get_pharmacy_staff_overview()` → list for the manage staff section.
  - `get_pharmacy_staff_profile(_user_id uuid)` → single profile for details page (also enforces same-pharmacy check).

## Technical notes

- Aesthetics: Tailwind, white cards, `rounded-2xl`/`rounded-xl`, soft `shadow-sm`, generous whitespace, emerald accents matching the existing ShopProfile look. Status dot is a 2.5×2.5 circle. Progress bar uses existing `Progress` component; circular target uses inline SVG.
- Top performer = staff with highest current-month total. Status dots: top performer green; staff at ≥60% of personal target yellow; below = no dot. Pending invites: gray dot.
- Commission Earned = `month_sales * commission_percent / 100` from `staff_settings`.
- Loyalty Score = count of distinct customers in `customer_ledger` (entry_type='due' or sale_id-linked) handled by this user this month who also appear in any prior month.
- Fastest Biller = highest count of completed sales this month. Customer Favorite = highest distinct customer count this month.
- Mobile-first: stat cards stack 2-up on mobile, 4-up on `sm:`. Details page uses a sticky header with back button matching other pages.
- No changes to invitation flow, no permission toggles, no audit logs.
