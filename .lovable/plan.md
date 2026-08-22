# Staff Management: standalone module + advanced features

## 1. What exists today

**Shop Profile (`src/pages/ShopProfile.tsx`, 793 lines)** is one page with a 5-item accordion: Shop Info, Manage Staff, Billing, Discount, and more. The staff accordion alone carries roughly a third of the file: a broadcast notice composer, invite-by-email form, active staff cards with monthly sales metrics, and pending/revoked invitation rows with resend/revoke/remove actions.

**Data it touches**
- `shop_staff` — invitations (email, role, status, token, expires_at). Read/written directly from the client.
- `get_pharmacy_staff_overview()` RPC — per-staff name, avatar, phone, role, month sales, month count, monthly target. Already role-filtered server-side.
- `pharmacy_broadcasts` — the notice composer.
- `staff_settings` — monthly target, commission %, basic salary. Currently only edited inside `/staff/:userId`.
- `staff_activity_logs` — written by DB triggers on sales, cash and ledger; not surfaced in the staff UI yet.
- `product_targets` — per-product incentives, shown on the performance detail page.
- `invite-staff` edge function — admin-only, accepts `owner | manager | salesman`, creates the invite row and returns the accept link.
- `profiles.role` — `admin` / `salesman`, used for gating (`isAdmin`). Note this differs from invitation role names; per your decision we keep both and map locally.

**Related pages** `/staff/:userId` (`StaffPerformanceDetails.tsx`) already covers per-person performance, salary math, advances and product targets. `usePharmacyStaff.ts` only wraps a presence RPC used by chat.

## 2. Proposed architecture

New route `/staff-management`, admin-only, plus a `Manage Staff` entry in the More menu (hidden for salesman). The Manage Staff accordion is removed from Shop Profile entirely, as you asked; Shop Profile keeps Shop Info, Billing, Discount.

```text
/staff-management  (page shell: header, KPI strip, search, tabs)
  ├─ StaffKpiStrip           team sales, active count, pending invites, target attainment
  ├─ StaffSearchBar          name/email search + role & status filters
  ├─ Tab "Team"    → StaffCard[]        → StaffActionMenu (sheet)
  ├─ Tab "Invites" → InvitationRow[]    → resend / revoke / delete
  └─ Tab "Activity"→ recent staff_activity_logs feed
```

All Supabase reads move into hooks so the page stays presentational: `useStaffOverview`, `useStaffInvitations`, `useStaffPermissions`, `useStaffActivity`. Existing RPCs and tables keep their current contracts, so `/staff/:userId`, chat and sales keep working untouched. Nothing about permissions is trusted from the client — every new capability is enforced by an RLS policy or a security-definer function.

## 3. Feature roadmap

**Core parity (must have)** invite by email with role, resend/revoke/delete invites, staff list with month sales and target progress, broadcast notice — all carried over from the accordion.

**Per-staff action menu**
- Suspend / reactivate access — blocks the member from using the shop without deleting them.
- Change role — promote/demote between manager and salesman.
- Edit salary / monthly target / commission — quick sheet reusing `staff_settings`.
- Remove from shop — unlinks the user from the pharmacy, with a typed confirmation.
- Open full performance page and open direct chat.

**Granular permission toggles (your chosen model)** roles stay fixed, and the owner flips per-staff switches: can view profit & margins, can edit inventory, can give discounts above the shop default, can record cash out / expenses, can close the day, can view other staff performance. Stored per staff member and enforced server-side.

**Insights** team leaderboard for the month, target attainment bars, last-active indicator, and a searchable activity feed so the owner can audit who sold or moved cash.

## 4. Phased implementation

**Phase 1 — DB foundation** (one migration)
- `staff_access` table: `pharmacy_id`, `user_id`, `is_suspended`, `suspended_at`, `suspend_reason`, unique on user. RLS: admins of the same pharmacy read/write; the member reads own row. GRANTs for `authenticated` + `service_role`.
- `staff_permissions` table: `pharmacy_id`, `user_id`, `permission_key`, `enabled`, unique `(user_id, permission_key)`. Same RLS shape.
- `has_staff_permission(_user_id uuid, _key text)` security-definer helper, plus `is_staff_suspended(_user_id uuid)`, both revoked from `anon` and `public`.
- Suspension is enforced where it matters, not just in UI: reject suspended users inside `complete_sale` and in the `cash_transactions` insert trigger.

**Phase 2 — Extract the page, no behaviour change**
Create `/staff-management` with the current accordion functionality moved verbatim into components + hooks, add the More-menu entry, remove the accordion from Shop Profile. Verify invite, resend, revoke, remove and broadcast still work before adding anything new.

**Phase 3 — Action menu**
Suspend/reactivate, change role, edit `staff_settings`, remove from shop. Role change and removal go through a `manage-staff` edge function (service role, admin-verified) so the client never writes another user's role.

**Phase 4 — Permission toggles**
Permissions sheet per staff member, `useStaffPermissions` hook, and consumption at the read sites that matter: profit/margin display, discount ceiling, cash-out form, daily closing, staff performance visibility. The AI assistant's existing RBAC scoping is extended with the same keys.

**Phase 5 — Search, filters, insights**
Debounced search, role/status filters, KPI strip, leaderboard, activity feed with pagination.

**Phase 6 — Verification**
Browser pass as owner and as salesman: confirm a salesman cannot reach `/staff-management`, a suspended staff member cannot complete a sale or record cash, and a staff member without the profit permission sees no margin figures. Unit tests for the permission hook and role mapping.

## Technical notes

- Role mapping helper: `profiles.role` (`admin` / `salesman`) stays the auth gate; `shop_staff.role` (`owner` / `manager` / `salesman`) stays the invitation label. A single `src/lib/staffRoles.ts` maps between them so no other file grows conditionals.
- `get_pharmacy_staff_overview()` gains suspension state and permission counts rather than being replaced, keeping `/staff/:userId` stable.
- `shop_staff.token` stays unreadable by admins (existing hardening); accept links continue to come from the `invite-staff` function response.
- No changes to sales, inventory or invoice logic beyond the permission checks listed in Phase 4.
