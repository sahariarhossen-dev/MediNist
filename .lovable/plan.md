# Activity, Security & Audit System — Full Implementation

Builds on the audit review: closes the logging coverage gaps, adds a Security chip, and ships four owner-facing UX features. `staff_activity_logs.severity` has no CHECK constraint, so a new `security` severity is safe to introduce.

## Phase 1 — Migration A: audit thresholds & inventory/ledger logging

- `pharmacy_settings`: add `large_cash_out_threshold numeric default 5000`, `closing_discrepancy_limit numeric default 500`, `price_drop_alert_percent numeric default 20`. Existing hard-coded ৳5,000 rule in `log_cash_transaction_activity` reads from here (falls back to the default when no settings row exists).
- New `log_medicine_update_activity()` — AFTER UPDATE on `medicines`, `SECURITY DEFINER`, early-returns when `auth.uid()` is null:
  - price change -> `inventory_price_change`, `audit`; `high_risk` when the drop exceeds `price_drop_alert_percent`.
  - stock decrease with no `sale_items` row for that medicine in the last 60 seconds -> `inventory_stock_adjust`, `high_risk`; increases -> `audit`.
  - expiry/pack edits -> `inventory_edit`, `audit`.
  - `metadata` always carries `{field, old, new}` pairs for the diff viewer.
  - Guard: single trigger, one insert max per statement, indexed lookups only — no effect on POS billing (sales decrement stock through `complete_sale`, which will set a `app.skip_inventory_log` flag so billing writes stay unlogged).
- Rewrite `log_customer_ledger_activity()` to cover all entry types and UPDATE/DELETE: `due_added` (`info`), `due_adjusted` (`audit`), `due_written_off` (`high_risk`), `payment_received` unchanged (`info`).

## Phase 2 — Migration B: cash closing, security & settings events

- `submit_blind_closing`: after writing the closing row, insert `day_closed` with `amount = discrepancy` and `metadata = {declared, system, discrepancy}` — `info` within ±৳50, `audit` beyond, `high_risk` when the shortfall exceeds `closing_discrepancy_limit`.
- Security stream (new severity `security`, so it lands in the Security chip; the genuinely dangerous ones stay `high_risk`):
  - `verify_staff_pin` -> `pin_failed` (`security`), `pin_locked` (`high_risk`).
  - `set_staff_pin` -> `pin_set` (`security`); `admin_reset_staff_pin` -> `pin_reset` (`security`).
  - `revoke_staff_session` -> `session_revoked` (`security`).
  - `session-guard` edge function -> `blocked_ip_attempt` (`high_risk`), written with the service-role client.
  - `read_only_block` (`high_risk`) — a trigger insert would roll back with the RAISE, so the attempt is logged from the guarded RPC paths (`complete_sale`, `request_medicine_deletion`, cash/ledger inserts) which check `is_staff_read_only` and log before refusing. Net effect: every refusal is recorded.
- Settings/permission audit triggers (all `audit`):
  - `pharmacy_settings` UPDATE -> `settings_changed` with old/new in `metadata`.
  - `pharmacies.default_discount` change -> `discount_policy_changed`.
  - `staff_permissions` INSERT/UPDATE/DELETE -> `permission_changed` (`{permission_key, old, new}`).
  - `staff_access.is_suspended` change -> `staff_suspended` / `staff_unsuspended`.

## Phase 3 — Frontend

`src/components/staff/ActivityFeed.tsx`
- Fix the filter guard: replace `or("action_type.neq.sale,severity.neq.info")` with a correct exclusion of `action_type='sale_create' AND severity='info'` (`or("action_type.neq.sale_create,severity.neq.info")`).
- Add the `Security` chip to `FILTERS`; badge styling in `badgeFor`/`iconFor` (violet, `ShieldAlert`).
- Rows with `metadata` diff pairs get a chevron affordance; tapping opens the new diff drawer.
- Subscribe to `staff_activity_logs` realtime (pharmacy-scoped) and raise a toast for incoming `high_risk` rows.

New components under `src/components/staff/`
- `LogDiffDrawer.tsx` — bottom sheet (`Drawer`) rendering `Stock: 50 ➔ 30` style rows from `metadata`, plus actor, time, amount.
- `RedFlagBanner.tsx` — "Today's Red Flags: X" card at the top of the Activity tab; counts today's `high_risk` rows for the current staff filter; tapping sets the feed filter to `high_risk`.
- `ExportAuditSheet.tsx` — date-range picker + staff selector, exports duty hours, invoice counts and audit rows. Excel via `xlsx` (SheetJS) and PDF via `jspdf` + `jspdf-autotable`; both generated client-side from a single fetch.

`src/components/staff/DutyControlCenter.tsx`
- Mounts `RedFlagBanner` and the Export button above `DutyCard`, and lifts the feed's severity filter into shared state so the banner can drive it.

## Phase 4 — Verification

- Browser pass as owner: edit a product price and stock, confirm two rows appear under High risk/Audit with a working diff drawer; confirm a routine sale produces no feed row; confirm the red-flag count matches a direct SQL count; export both files and open them.
- Confirm a normal POS sale writes no `inventory_*` log and adds no measurable latency (timing check around `complete_sale`).

## Technical notes

- Every new function is `SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` to `authenticated` only; triggers early-return when `auth.uid()` is null so cron/edge writes never create ownerless rows.
- Existing partial indexes on `(pharmacy_id, severity, created_at DESC)` already cover the new chip and the red-flag count.
- Export is fully client-side; no new edge function or storage bucket.
- New npm deps: `xlsx`, `jspdf`, `jspdf-autotable`.
