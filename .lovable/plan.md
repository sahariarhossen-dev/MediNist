# Staff Duty & Fraud Control Center (Activity tab pivot)

Replaces the screen-time / tab-switch framing with owner-actionable duty and approval control. Verified against the current DB and code before writing this plan.

## What exists today (confirmed)

- `staff_shifts` is written only by the `heartbeat_shift` RPC (browser telemetry) and has admin/self SELECT policies but no INSERT/UPDATE policies — all writes go through RPCs. `close_stale_shifts()` runs every 15 min via cron (jobid 15) and closes shifts idle >10 min.
- `staff_access` holds suspension only (`is_suspended`, `suspend_reason`); there is no read-only concept.
- `admin_override_requests` already exists with `entity_type`, `entity_id`, `action`, `reason`, `status`, resolve columns and the right RLS (members insert own, admins update). This is the natural home for both approval queues — no new queue table needed.
- `medicines` has no soft-delete column. Deletion is a direct client `supabase.from("medicines").delete()` in `src/pages/Inventory.tsx`, allowed by the pharmacy-wide `ALL` policy. A `log_medicine_delete_activity` trigger logs it as high risk after the fact.
- `complete_sale` clamps `discount_percent` to 0-100, zeroes it for wholesale, and blocks suspended staff. `pharmacies.default_discount` exists but is not enforced as a ceiling.
- Activity tab today: `ActivityFeed.tsx` (KPI strip, severity chips, staff dropdown, shift rows) plus `StaffPresenceStrip.tsx`; `SecurityPanel.tsx` holds sessions/PIN/IP.

## 1. DB schema & workflows

**Soft delete for inventory (feature 1)**
- `medicines`: add `deleted_at timestamptz`, `deletion_requested_at timestamptz`, `deletion_requested_by uuid`, plus a partial index on pending rows.
- New RPC `request_medicine_deletion(_medicine_id, _reason)`: owner deletes immediately (hard delete, unchanged behaviour); manager/salesman instead sets `deletion_requested_*` and inserts an `admin_override_requests` row (`entity_type='medicine'`, `action='delete'`, `status='pending'`).
- New RPC `resolve_medicine_deletion(_request_id, _approve boolean)` (admin only): approve = hard delete the row + resolve the request; restore = clear the flags + resolve as `rejected`.
- Inventory lists filter out `deletion_requested_at is not null` for non-owners, so the product visibly leaves the salesman's shelf while the owner decides. Owner sees it with a "Pending deletion" badge.
- Revoke blanket DELETE on `medicines` from `authenticated` and keep deletion only via these RPCs.

**Remote read-only lock (feature 2)**
- `staff_access`: add `is_read_only boolean not null default false`, `read_only_since timestamptz`, `read_only_reason text`. New helper `is_staff_read_only(_user_id)` (security definer, stable).
- Enforcement is server-side first: `complete_sale`, `tg_cash_transactions_prevent_negative`-adjacent write paths, the medicine write policies and the customer-ledger insert path all raise `ACCESS_READ_ONLY` when the flag is set. Client shows the banner and disables mutating CTAs, but the DB is the gate.
- Toggle via `admin_set_staff_read_only(_user_id, _on boolean, _reason text)`; logged to `staff_activity_logs` as `audit`.

**Manual duty tracking (features 5, 6)**
- `staff_shifts`: add `source text not null default 'auto'` (`auto` | `manual`), `opened_by uuid`, `closed_by uuid`, `close_reason text` (`manual` | `midnight` | `max_hours` | `stale`).
- RPCs `admin_start_shift(_user_id, _note)` and `admin_stop_shift(_user_id)` — admin/manager only, idempotent (starting when a shift is open is a no-op, stopping sets `ended_at = now()` and fills `active_seconds` from wall-clock duration for manual shifts).
- `close_stale_shifts()` is extended (not replaced) to also close any shift open past local midnight or longer than 12 hours, tagging `close_reason`. Manual shifts are exempt from the 10-minute heartbeat rule so an owner-opened shift is never cut short.
- A separate 00:10 Asia/Dhaka cron entry calls the same function so month-boundary records are always clean.

**High-discount approval (feature 7)**
- `pharmacy_settings`: add `max_discount_percent numeric not null default 15`, `require_discount_approval boolean not null default true`.
- `complete_sale` gains a check: when `discount_percent > max_discount_percent` and the caller lacks `override_discount` permission, the sale is written with `status='pending_approval'` (stock is still decremented so the counter stays honest) and an `admin_override_requests` row is created (`entity_type='sale'`, `action='high_discount'`). The client gets the sale id plus a `pending_approval` flag and shows "Waiting for owner approval".
- `resolve_sale_discount(_request_id, _approve)`: approve flips `status='completed'`; reject voids the sale, restores stock, and logs `high_risk`.
- No signature change to `complete_sale`, so existing callers keep working.

**Metrics (features 3, 4, 8)**
- New RPC `get_staff_duty_summary(_user_id uuid default null)` returning one JSON object: `invoices_today`, `sales_amount_today`, `duty_seconds_today`, `duty_seconds_month`, `invoices_month`, `pending_deletions`, `pending_discounts`, `is_read_only`, `shift_open`, `shift_started_at`. Admin/manager may pass any member; a staff member only gets their own.
- New RPC `get_pending_approvals(_user_id uuid default null)` joining `admin_override_requests` to medicine/sale detail for the queue cards.

## 2. UI/UX breakdown

The Activity tab becomes a single scrollable control column, ordered by urgency. Same card language (`rounded-2xl`, semantic tokens) as today.

```text
┌ Activity ─────────────────────────────┐
│ [ 👤 Select Staff Member        ▾ ]   │  drives everything below
├───────────────────────────────────────┤
│ DUTY CARD                             │
│ ● On duty since 9:12 AM   [Stop Shift]│  (owner/manager only)
│ Today 4h 06m · Invoices 23            │
│ Remote lock  [ ○——— ]  read-only mode │
├───────────────────────────────────────┤
│ NEEDS YOUR APPROVAL              (2)  │  hidden when empty
│ ⚠ Delete "Napa 500"  Rahim · 5m       │
│    [Confirm Delete] [Restore]         │
│ ⚠ 25% discount · INV-1042 · ৳1,240    │
│    [Approve] [Reject]                 │
├───────────────────────────────────────┤
│ MONTH TO DATE (staff selected only)   │
│ Hours 96h 40m │ Invoices 412 │ Pend 2 │
├───────────────────────────────────────┤
│ [All] [High risk] [Audit] [Shifts]    │
│ 🔍 search …            [ ] routine sales│
│ … existing feed, unchanged …          │
└───────────────────────────────────────┘
```

- With "All Staff" selected: duty card collapses into a compact roster (existing presence strip, restyled to show clock-in + today's hours + a per-row Start/Stop), approvals show every pending item, the month card is hidden.
- Approval actions are inline with a confirm dialog for destructive ones; each resolves optimistically and refetches the summary.
- Staff (non-admin) opening the tab see only their own duty and month card — no toggles, no approval queue.
- Read-only staff see a persistent `App Blocked by Shop Owner` banner in `AppLayout`, and mutating buttons render disabled with a tooltip.
- Desktop just widens: duty + month cards sit side by side above a two-column approvals/feed split.
- Screen-time language is dropped: "Idle today" leaves the KPI strip, replaced by "Invoices today"; heartbeat telemetry stays as the presence signal only.

## 3. Phased rollout (no breaking changes)

1. **Migration A — duty & lock foundation.** `staff_access` read-only columns, `staff_shifts` source/audit columns, `is_staff_read_only`, `admin_start_shift` / `admin_stop_shift` / `admin_set_staff_read_only`, extended `close_stale_shifts` + midnight cron. Nothing user-visible; existing sales/inventory paths untouched.
2. **Migration B — approval workflows.** `medicines` soft-delete columns, `request_medicine_deletion` / `resolve_medicine_deletion`, `pharmacy_settings` discount ceiling, `complete_sale` discount branch, `resolve_sale_discount`. `complete_sale` keeps its signature and default behaviour when the discount is under the ceiling.
3. **Migration C — read-only enforcement + metrics RPCs.** Add the `ACCESS_READ_ONLY` guard to the sale/cash/inventory paths, `get_staff_duty_summary`, `get_pending_approvals`.
4. **Client: duty & lock UI.** New `DutyCard`, `ApprovalQueue`, `MonthlySummaryCard` components; rewire `ActivityFeed` to the single staff dropdown; read-only banner in `AppLayout`.
5. **Client: inventory delete rerouting.** `Inventory.tsx` calls `request_medicine_deletion`; copy differs for owner ("Delete") vs staff ("Request deletion"). Sale screen handles the `pending_approval` result.
6. **Verification.** Browser passes as owner and as salesman: salesman delete creates a pending request and hides the product; owner Confirm/Restore behaves correctly; a 25% discount sale lands in the queue and stock reconciles on reject; read-only staff can browse but every mutation is refused server-side; a shift opened yesterday is closed at midnight with `close_reason='midnight'`; month totals match the shift rows.

## Technical notes

- Both approval queues reuse `admin_override_requests` and its existing RLS, so no new tenant-isolation surface.
- Every new table column ships with the house GRANT/RLS ordering; new functions are `security definer`, `search_path=public`, EXECUTE granted to `authenticated` only.
- Read-only mode is enforced in the DB, not just the UI — the banner is cosmetic.
- Manual shifts are wall-clock; heartbeat shifts keep their active/idle split, so monthly hours never double count (one open shift per member is enforced by a partial unique index on `(user_id) where ended_at is null`).
