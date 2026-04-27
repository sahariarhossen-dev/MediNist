## Staff Monitoring System

Build an audit trail and presence tracking layer so Owners/Managers can see what every staff member is doing in real time.

### 1. Database changes (migration)

**New table `staff_activity_logs`**
- `id` uuid PK (gen_random_uuid)
- `pharmacy_id` uuid not null
- `user_id` uuid not null (the actor)
- `action_type` text not null — one of: `login`, `logout`, `sale_create`, `sale_update`, `sale_delete`, `transaction_create`, `transaction_update`, `transaction_delete`, `payment_received`, `inventory_edit`, `inventory_delete`, `customer_edit`
- `entity_type` text null (e.g. `sale`, `cash_transaction`, `medicine`, `customer`)
- `entity_id` uuid null
- `description` text null (human-readable, e.g. "Sold 3 items for ৳450 to Karim")
- `amount` numeric null (set for sales / transactions)
- `metadata` jsonb default `'{}'` (extra context: payment method, customer name, etc.)
- `created_at` timestamptz default now()

Indexes: `(pharmacy_id, created_at desc)`, `(user_id, created_at desc)`, `(action_type)`.

**RLS policies** (mirror `cash_transactions`):
- `Members can view pharmacy logs` — SELECT where `pharmacy_id = get_user_pharmacy_id()` AND `is_pharmacy_admin()` (only Owner/Manager-with-admin-role can read; Salesmen cannot view logs).
  - Note: current schema only distinguishes `admin` vs others via `is_pharmacy_admin()`. We will gate visibility to admins only and hide the page from salesmen/manager in UI. If Manager visibility is wanted later we add a `has_role('manager')` style helper.
- `System can insert logs` — INSERT where `pharmacy_id = get_user_pharmacy_id()` AND `user_id = auth.uid()` (so triggers running as the acting user can write).
- No UPDATE / no DELETE policies (immutable audit trail).

**Trigger functions** (SECURITY DEFINER, set `search_path=public`):

1. `log_sale_activity()` — AFTER INSERT/UPDATE/DELETE on `sales`:
   - Only log when `status = 'completed'` (skip drafts).
   - Insert row with `action_type` `sale_create` / `sale_update` / `sale_delete`, `amount = NEW.total`, description `"Sale of ৳{total}"`.

2. `log_cash_transaction_activity()` — AFTER INSERT/UPDATE/DELETE on `cash_transactions`:
   - `action_type` `transaction_create` / `_update` / `_delete`.
   - Description includes `direction` + `category` + `party_name`.
   - `amount = NEW.amount`.

3. `log_customer_ledger_activity()` — AFTER INSERT on `customer_ledger` for `entry_type = 'payment'` → `payment_received`.

All triggers use `auth.uid()` as `user_id` and `NEW.pharmacy_id`; if `auth.uid()` is null (system context) the trigger no-ops.

**`profiles.last_seen` column**
- Add `last_seen timestamptz null` to `profiles`.
- Add RPC `public.touch_last_seen()` (SECURITY DEFINER, sets search_path) that runs `UPDATE profiles SET last_seen = now() WHERE id = auth.uid()`. This avoids needing to broaden the profile UPDATE RLS check policy.

### 2. Frontend wiring

**Presence (`src/contexts/AuthContext.tsx`)**
- After session is established and on every `visibilitychange` → visible event, call `supabase.rpc('touch_last_seen')`.
- Set up a heartbeat: every 60s while the tab is visible, call the RPC.
- On `signOut`, insert a `logout` row via `staff_activity_logs` (best-effort) and update last_seen one final time. Login event logged on first auth state change after `SIGNED_IN`.

**Active Staff metric (`src/pages/Index.tsx`)**
- Replace the current "distinct sale user_id" calculation with a query against `profiles` filtered by `pharmacy_id` where `last_seen >= now() - interval '5 minutes'`. Keep card unchanged for salesmen (they already see their personal view).

**New page `src/pages/StaffActivity.tsx`** (route `/more/staff-activity`, admin-only)
- Header "Staff Activity" with date filter (Today / 7 days / 30 days) and optional staff filter dropdown (uses `get_pharmacy_member_names()`).
- Lists `staff_activity_logs` joined with member names, grouped by day, newest first. Each row shows icon by `action_type`, staff name, description, amount (if any), relative time.
- Realtime subscription on `staff_activity_logs` insert for the pharmacy so the page updates live.
- Empty / loading / error states matching existing pages (`DailyTransactions` style).

**More menu (`src/pages/More.tsx`)**
- Add "Staff Activity" item (icon: `Activity` from lucide), only visible when `profile.role === 'admin'`. Filter line extended to also hide for non-admins.

**Routing (`src/App.tsx`)**
- Register `/more/staff-activity` → `StaffActivity` inside the existing protected layout.

### 3. Security notes
- All inserts to `staff_activity_logs` happen via DB triggers, not client code, so a compromised client cannot suppress them (RLS forbids DELETE/UPDATE entirely).
- RPC `touch_last_seen` is the only path that mutates `last_seen`, and it can only update the caller's own row.
- Login/logout events logged from the client are convenience entries; the underlying audit is sales/transactions which are trigger-driven and tamper-resistant.

### 4. Files touched
- New migration (table + indexes + RLS + 3 triggers + `last_seen` column + RPC).
- New: `src/pages/StaffActivity.tsx`.
- Edit: `src/contexts/AuthContext.tsx`, `src/pages/Index.tsx`, `src/pages/More.tsx`, `src/App.tsx`.
