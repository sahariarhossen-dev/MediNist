# Activity Filter Chips — Audit Coverage Review & Proposed Log Expansion

## Part 1: What populates each chip today (verified in DB)

The feed in `src/components/staff/ActivityFeed.tsx` merges two sources: rows from `staff_activity_logs` (filtered by `severity`) and synthetic rows built from `staff_shifts` (always rendered as severity `shift`). Routine sales (`action_type='sale_create'` at `info`) are excluded by the `or("action_type.neq.sale,severity.neq.info")` guard — note this guard tests `sale`, not `sale_create`, so info-level `sale_create` rows currently still pass the filter.

### Shifts (`severity='shift'`)
- Synthetic rows from `staff_shifts` (one per shift row, "Duty started … / on duty now"). Shift rows are created by the `heartbeat_shift` RPC (browser telemetry) and by manual owner control.
- `shift_start` — inserted by `admin_start_shift` ("Shift started by owner/manager").
- `shift_end` — inserted by `admin_stop_shift` ("Shift stopped by owner/manager").
- Also a `shift` insert on first heartbeat shift creation (migration `20260822191001`).
- Live data: 13 `shift_start` rows at `shift`.

### High risk (`severity='high_risk'`)
From triggers:
- `log_sale_activity` (on `sales`): `sale_void` (completed -> non-completed), `sale_delete` (delete of a completed sale).
- `log_cash_transaction_activity` (on `cash_transactions`): `transaction_delete` (any deleted non-sale cash row); `transaction_create` where `direction='out'` and `amount >= 5000` (large cash-out).
- `log_medicine_delete_activity` (on `medicines`): `inventory_delete`, with stock quantity captured in `metadata`.

From RPCs:
- `request_medicine_deletion` -> `deletion_requested` ("Requested deletion of …").
- `complete_sale` -> `discount_approval_requested` when the discount exceeds `pharmacy_settings.max_discount_percent`.
- `resolve_sale_discount` reject path logs high risk.

### Audit (`severity='audit'`)
- `log_sale_activity`: `sale_update` (edit of an already-completed sale); `sale_create` whose `discount_percent` exceeds `pharmacies.default_discount`.
- `log_cash_transaction_activity`: `transaction_update` (edited cash row); `transaction_create` with `direction='out'` below the ৳5,000 threshold.
- `admin_set_staff_read_only` -> `remote_lock_on` / `remote_lock_off`.
- `resolve_medicine_deletion` -> `deletion_approved` / `deletion_restored`.
- `resolve_sale_discount` approve path -> `discount_approved`.

### Info (never chip-filtered, shown only under "All")
`sale_create` (routine), `transaction_create` (cash in), `payment_received` (customer ledger payment), `ai_denied_query` (RBAC refusal from `ai-chat`), `staff_removed`, `staff_role_changed`.

## Part 2: Coverage gaps found in the codebase

Actions that mutate money, stock, access, or identity today with **no** `staff_activity_logs` entry:

1. **Inventory edits.** `medicines` has a delete trigger only. Price changes, stock_quantity changes, and expiry edits from `AddProduct.tsx` / `Inventory.tsx` are unlogged — the single easiest way to hide theft (drop stock, raise price, edit later).
2. **Customer ledger, except payments.** `log_customer_ledger_activity` returns early unless `entry_type='payment'`. Manual due creation, adjustments, and write-offs (`AddManualDueSheet`, `customer_dues`) leave no trace, and there is no UPDATE/DELETE logging at all.
3. **Security events.** `verify_staff_pin` failures/lockouts, `revoke_staff_session`, `set_staff_pin` / `admin_reset_staff_pin`, IP-restriction blocks (`session-guard`), and revoked-session forced sign-outs are all silent in the feed.
4. **Permission and access changes.** Direct writes to `staff_permissions` and suspension toggles on `staff_access` (`is_suspended`) are not logged; only role change, removal, and read-only lock are.
5. **Day close.** `submit_blind_closing` / `daily_closings` (declared vs system cash, discrepancy) never reach the feed — the single most owner-relevant number.
6. **Read-only refusals.** `tg_block_read_only_staff` raises but records nothing, so repeated attempts by a locked user are invisible.
7. **Shop settings.** Changes to `pharmacies.default_discount`, `pharmacy_settings.max_discount_percent`, and `require_discount_approval` are unlogged — someone can raise the ceiling and then discount freely.

## Recommended additions (highest impact first)

1. **`log_medicine_update_activity` trigger** on `medicines` UPDATE — emit `inventory_price_change` (`audit`, `high_risk` if price drops >20%), `inventory_stock_adjust` (`high_risk` when stock is reduced without a matching sale), with old/new values in `metadata`.
2. **Cash-drawer closing log** — inside `submit_blind_closing`, insert `day_closed` with `amount = discrepancy`: `info` when within ±৳50, `audit` beyond that, `high_risk` when shortfall exceeds a configurable limit.
3. **Security event stream** — log `pin_failed` (`audit`), `pin_locked` (`high_risk`), `session_revoked` (`audit`), `pin_reset` (`audit`), `blocked_ip_attempt` (`high_risk`) from `verify_staff_pin`, `revoke_staff_session`, `admin_reset_staff_pin`, and `session-guard`. Add a 5th chip **Security**, or fold these into Audit/High risk.
4. **Ledger write-off / due adjustment log** — extend `log_customer_ledger_activity` to cover every `entry_type` plus UPDATE/DELETE: `due_added` (`info`), `due_adjusted` (`audit`), `due_written_off` (`high_risk`).
5. **Access & settings audit** — triggers on `staff_permissions`, `staff_access.is_suspended`, `pharmacy_settings`, and `pharmacies.default_discount` writing `permission_changed` / `staff_suspended` / `discount_policy_changed` at `audit`, plus `read_only_block` (`high_risk`) from `tg_block_read_only_staff` (needs an autonomous-transaction or pre-raise insert pattern).

## Technical notes

- All new logging belongs in `SECURITY DEFINER` triggers/RPCs following the existing `log_*_activity` shape (early return when `auth.uid()` is null so cron and edge-function writes don't create ownerless rows).
- Severity thresholds (large cash-out ৳5,000, closing discrepancy, price-drop %) should move into `pharmacy_settings` columns rather than staying hard-coded in function bodies.
- `ActivityFeed` needs no structural change for items 1-5 except the `sale`/`sale_create` filter fix and, if we add the Security chip, one more entry in `FILTERS`.
