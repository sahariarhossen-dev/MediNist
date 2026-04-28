## Goal

Make personal performance analytics part of every staff member's own **Profile** page (showing only their own data), and restrict **Manage Staff** strictly to admins.

---

## 1. Personal Profile Page (`src/pages/Profile.tsx`)

Replace the static "Monthly Target" card with a live analytics block — same visual language as the Staff Performance Details page, but always scoped to the logged-in user.

Keep:
- Header, avatar uploader, name/pharmacy line
- "User Identity" card
- Security/password accordion
- Log Out button

Remove:
- Hard-coded "Monthly Target" card (`monthlyTarget = 500000`, `achievement = 400000`)

Insert (directly under User Identity, in this order):

1. **Analytics grid (2×2)** — same `StatCard` style:
   - This Month — sum of `sales.total` where `user_id = me.id`, status `completed`, current month
   - This Week — same filter, current ISO week (Mon-start)
   - Commission — `monthSales × staff_settings.commission_percent / 100`
   - Loyalty Score — count of distinct customers handled this month who also appear in `customer_ledger` before this month (same logic already in StaffPerformanceDetails)

2. **Monthly Target circular progress card** — large `CircularProgress` matching current Profile design, value = `monthSales / monthly_target`. Pencil/edit icon **only when `profile.role === 'admin'`** (non-admins see read-only).

3. **Achievements card** — three `BadgeTile`s (Top Seller, Fastest Biller, Customer Favorite) with the same auto-calculation rules as `StaffPerformanceDetails`. Earned-state determined by comparing the user against pharmacy-wide month winners.

Data fetching: one effect on mount that runs the same queries as `StaffPerformanceDetails` but hard-coded to `userId = user.id`. Reuse the existing `staff_settings` row (read via `select` already permitted by current RLS — all pharmacy members can read pharmacy staff_settings rows; if we want stricter per-user reads, see "RLS notes" below).

To avoid duplication, extract the small visual helpers (`StatCard`, `CircularProgress`, `BadgeTile`) into a tiny shared module `src/components/staff/PerformanceWidgets.tsx` and import them from both `Profile.tsx` and `StaffPerformanceDetails.tsx`.

---

## 2. Manage Staff (`src/pages/ShopProfile.tsx`)

The Shop Profile page itself stays accessible to everyone (shop info is useful to all staff), but the **Manage Staff accordion section is admin-only**:

- Wrap the entire `AccordionItem value="manage-staff"` (and the surrounding "Top Performer" card / invite form / staff list) in `{isAdmin && ( … )}`.
- Non-admins simply don't see the section.

Direct route protection for `/staff/:userId`:
- In `StaffPerformanceDetails.tsx` the existing guard already redirects when the visitor is neither admin nor the staff themselves. Update it to additionally redirect non-admins to `/profile` (instead of `navigate(-1)`) — so a salesman who hits `/staff/<someone-else-id>` lands on their own profile.
- Salesmen/managers no longer need to click into `/staff/:userId` for themselves; their analytics live on `/profile`. We'll keep the route working (admins use it to view any staff member; a staff member viewing their own ID still works as a fallback).

---

## 3. RLS / data access

Current state already supports the requirements:

- `sales` SELECT policy: `pharmacy_id = get_user_pharmacy_id()` — every member can read pharmacy sales. We rely on **client-side filtering by `user_id = auth.uid()`** for the personal Profile cards. This matches how `StaffPerformanceDetails` already aggregates.
- `staff_settings` SELECT policy: any pharmacy member can read; **only admins can INSERT/UPDATE/DELETE**. ✓ matches "non-admins read-only".
- `customer_ledger` SELECT policy: pharmacy members can read — needed for loyalty / customer-favorite calculation. ✓

No schema or policy changes are required. The "personal data only" rule is enforced in the UI (we never display other users' rows on `/profile`), and write-protection on targets/commissions is already enforced by RLS on `staff_settings`.

---

## Files

**Edited**
- `src/pages/Profile.tsx` — remove static target, add analytics grid + dynamic target + achievements
- `src/pages/ShopProfile.tsx` — wrap Manage Staff accordion in `isAdmin` guard
- `src/pages/StaffPerformanceDetails.tsx` — redirect denied users to `/profile`; import shared widgets

**Created**
- `src/components/staff/PerformanceWidgets.tsx` — shared `StatCard`, `CircularProgress`, `BadgeTile` (extracted from current `StaffPerformanceDetails.tsx` to avoid duplication)

No DB migrations, no new RPCs, no edge functions.
