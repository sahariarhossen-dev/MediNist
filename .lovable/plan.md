## Phase 5 — Atomic Sales (`complete_sale` RPC)

**Problem recap**
- `CreateSale.tsx` currently inserts into `sales`, then `sale_items`, then loops `UPDATE medicines SET stock_quantity = ...`, then optionally writes `customer_ledger` / `cash_transactions`. Any mid-flight failure leaves orphan rows. Two cashiers ringing the same SKU race on stock. Pure cash sales never write `cash_transactions`, so `submit_blind_closing` double-counts them via the `sales` aggregate.

**Migration: `public.complete_sale(_payload jsonb) returns uuid` (SECURITY DEFINER)**
Single transaction performs:
1. Auth + pharmacy resolution from `auth.uid()` → `profiles.pharmacy_id`. Reject if missing.
2. Validate payload shape (subtotal, discount, total, items[], payment{method,cash,due,customer_id?}). Reject negatives / NaN / empty items.
3. `INSERT INTO sales (...) RETURNING id`.
4. For each item: `INSERT INTO sale_items` AND `UPDATE medicines SET stock_quantity = stock_quantity - _qty WHERE id = _med AND pharmacy_id = _pharmacy AND stock_quantity >= _qty RETURNING id`. If no row returned → `RAISE EXCEPTION 'INSUFFICIENT_STOCK:<medicine_id>'` (rolls back everything).
5. If `due_amount > 0` AND `customer_id` present → `INSERT INTO customer_ledger (entry_type='due', ...)`. Reject due > 0 with no customer.
6. **Always** write a single `cash_transactions` row for the cash portion when `cash_amount > 0` (category `sale`, `sale_id = v_sale`). Update `submit_blind_closing` so it no longer also adds the `sales.total` cash component — instead it sums `cash_transactions` only. (Net effect: no double count, single source of truth.)
7. Return `v_sale_id`.

**Frontend changes (`src/pages/CreateSale.tsx`)**
- Replace the multi-step insert block with a single `supabase.rpc('complete_sale', { _payload })` call.
- Map RPC errors:
  - `INSUFFICIENT_STOCK:<id>` → toast naming the medicine.
  - generic Postgres errors → `err.message`.
- Remove client-side stock UPDATE loop and the separate cash/ledger inserts.
- Keep the optimistic UI but only flip to "complete" after RPC returns.

**`submit_blind_closing` update**
Replace the `v_total_sales` cash contribution with `SUM(cash_transactions WHERE category IN ('sale','due_collection','other_in') AND direction='in') - SUM(... direction='out')`. Today's total sales stays for reporting, but cash math is driven entirely by `cash_transactions`.

---

## Phase 6 — Uniqueness & Integrity Constraints

Order matters: dedupe data first, then add the constraint, in the **same migration** wrapped in a transaction.

1. **`pharmacies.name`** — Bangladesh allows duplicate trade names, so instead of a global unique we add:
   - `CREATE UNIQUE INDEX pharmacies_owner_name_idx ON pharmacies (owner_id, lower(name))` (prevents the same owner from creating two identical shops on a double-click).
   - Dedupe step: for any `(owner_id, lower(name))` collision, append ` (2)`, ` (3)` to the older duplicates' names.

2. **`shop_staff` pending invitations** — prevent two pending invites to the same email for the same shop:
   - Dedupe: keep newest pending per `(pharmacy_id, lower(email))`, mark older ones `status='superseded'`.
   - `CREATE UNIQUE INDEX shop_staff_pending_unique ON shop_staff (pharmacy_id, lower(email)) WHERE status = 'pending'`.

3. **`sale_items`** — prevent a row referencing a missing sale (defensive):
   - Add `ON DELETE CASCADE` only if FK is missing; check first.

4. **`medicines.stock_quantity`** — add a CHECK trigger (not constraint, per project rules) `stock_quantity >= 0` enforced on UPDATE. Backstop for any non-RPC writer.

5. **`cash_transactions`** — add partial unique index `(sale_id, category)` WHERE `sale_id IS NOT NULL` so a retried `complete_sale` cannot double-write the cash row for the same sale.

---

## Rollout order (single approval, two migrations)

1. **Migration A (Phase 5):** create `complete_sale`, rewrite `submit_blind_closing`. Ship `CreateSale.tsx` rewrite in the same response.
2. **Migration B (Phase 6):** dedupe + unique indexes + non-negative stock trigger + cash_transactions partial unique.

No table grants needed — no new tables.

## Out of scope

- No UI redesign of `CreateSale`. Only the submit handler changes.
- No change to refund/void flow (does not exist yet).
- No backfill of historical `cash_transactions` rows for old cash sales — `submit_blind_closing` change is forward-looking; old `daily_closings` rows stay as written.
