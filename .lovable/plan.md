## Blind Cash Closing & Invoice Action Lock

Two related security features:
1. A blind cash-counting flow so staff can never see the system total before declaring their drawer cash, and any mismatch is logged.
2. Lock destructive actions on completed invoices behind an Owner-only path, with a Manager "Admin Override Request" workflow.

### 1. Database changes (migration)

**Extend `daily_closings`** with shift/blind-count fields:
- `closed_by_user_id uuid null` — who submitted the count.
- `declared_cash numeric null` — physical cash entered by staff.
- `system_cash numeric null` — server-computed expected cash at submit time.
- `discrepancy numeric null` — `declared_cash - system_cash` (signed; positive = surplus, negative = shortage).
- `notes text null` — optional staff note.
- `closing_type text not null default 'auto'` — `'auto'` (cron) or `'manual'` (shift end).

The cron-written rows continue using defaults; manual shift-ends populate the new columns.

**New table `admin_override_requests`** (audit trail for "I need to edit/delete invoice X"):
- `id`, `pharmacy_id`, `requested_by uuid`, `entity_type text` (`'sale'`), `entity_id uuid`, `action text` (`'edit'` | `'delete'`), `reason text`, `status text default 'pending'` (`pending` | `approved` | `denied`), `resolved_by uuid null`, `resolved_at timestamptz null`, `created_at`.
- RLS: pharmacy admins can SELECT/UPDATE all rows in their pharmacy; members can INSERT their own request and SELECT their own rows.

**New RPC `submit_blind_closing(_declared numeric, _notes text)`** — SECURITY DEFINER. Steps:
1. Resolve caller's pharmacy_id; require auth.
2. Compute `system_cash` for today using the same formula already in `DailyTransactions`/`Index` (starting balance + cash sales today + due received + cash-in investments − payments).
3. Upsert into `daily_closings` for today with `closing_type='manual'`, set `declared_cash`, `discrepancy`, `closed_by_user_id`, `notes`, `closed_at = now()`. Keep auto-calculated totals (sales/cash_in/payments/due/net_balance) consistent with the formula.
4. Insert a `staff_activity_logs` row: `action_type = 'blind_closing'`, `amount = declared_cash`, `metadata = { system_cash, discrepancy, notes }`. (The audit row is the "notification" to the Owner — already surfaces on the Staff Activity page in real time.) If `abs(discrepancy) >= 1`, also insert `action_type = 'closing_discrepancy'` so it stands out.
5. Return `{ ok: true }` (do NOT return system_cash → blind input requirement).

**RLS on the new RPC**: granted to authenticated. The RPC itself enforces "manager or salesman role only" — owners are not blocked, but they have access to the totals on the Daily Transactions page anyway.

**Sales delete RLS**: already restricted to admin (`is_pharmacy_admin()`). Add a matching restriction to ensure UPDATE on completed sales is admin-only as well, so even API-level edits by a manager are denied:
- Replace the existing `Creator or admin can update sales` policy with one that allows updates only when `status <> 'completed'` OR caller is admin. This protects against direct API edits.

### 2. Frontend

**New page `src/pages/CashClosing.tsx`** at `/more/cash-closing`:
- Header "Shift End — Cash Closing".
- Big-number input asking "Count the physical cash in the drawer right now and enter the total" (BDT, integer, validated 0–10,000,000 with zod).
- Optional notes textarea.
- A single "Submit Closing" button. NO running totals, NO sales summary, NO "expected cash" hint anywhere on the page.
- After submit:
  - Calls `submit_blind_closing` RPC.
  - Shows a confirmation card: "Closing recorded. Owner has been notified." Owner sees the breakdown (declared vs system vs discrepancy) on a separate review card; staff only see "submitted".
  - If Owner navigates here, they instead see a "Today's Closing Review" view listing today's manual closing with declared, system, discrepancy, who submitted, and notes, plus link back to Daily Transactions.

Add a More-menu entry "Shift End / Cash Closing" (icon `LockKeyhole`) visible to all roles.

**Action lock on Sales/Invoice (`src/pages/Invoice.tsx`)**:
- Add an "Edit Invoice" and "Delete Invoice" button to the invoice toolbar.
  - Owner (`profile.role === 'admin'`): buttons enabled. Edit re-routes to `/create-sale?draft={id}` (we'll allow editing completed sales for owner by reverting status to draft on click after confirmation), Delete shows a confirm dialog and removes via existing RLS.
  - Manager / Salesman: both buttons present but visually locked (lock icon). Tapping opens a small "Request Admin Override" sheet asking for a reason; submitting inserts a row in `admin_override_requests` and shows a toast "Request sent to Owner". This also writes a `staff_activity_logs` row (`action_type = 'override_request'`) so it shows live to the Owner.
- The Sales list (`src/pages/Sales.tsx`) is unchanged (entries open the Invoice page, where the locked actions live).

**Owner override-request inbox**:
- Add a section "Pending Override Requests" at the top of the Staff Activity page (admin-only) listing pending rows with Approve / Deny buttons.
  - Approve: marks request `approved`, logs `override_approved`, and (for `delete` requests) does not auto-delete — owner still performs the action; it merely permits the manager to retry. For `edit`, sets a short-lived flag (we'll use the `approved` status itself; manager UI checks for an open approved request before unlocking).
  - Deny: marks `denied`, logs `override_denied`.

(Initial release: Manager UI does NOT auto-unlock on approval — per spec it's "for now, just log the request". The Approve/Deny UI is a thin owner-side response; can be wired into manager unlock later.)

### 3. Files touched
- New migration: `daily_closings` columns, `admin_override_requests` table + RLS, `submit_blind_closing` RPC, updated sales UPDATE policy.
- New: `src/pages/CashClosing.tsx`.
- Edit: `src/App.tsx` (route), `src/pages/More.tsx` (menu item), `src/pages/Invoice.tsx` (Edit/Delete + override sheet), `src/pages/StaffActivity.tsx` (override-request inbox + new action_type icons), `src/pages/CreateSale.tsx` (allow loading a completed sale as draft when caller is admin).

### 4. Security notes
- Blind input: the RPC is the only place `system_cash` is computed for the closing; the page never queries totals, so a salesman cannot peek even by inspecting the DOM/network.
- Discrepancies are written via the SECURITY DEFINER RPC and the `staff_activity_logs` triggers — both are immutable from the client (no UPDATE/DELETE policies).
- Sales UPDATE is hardened at the DB level so even a crafted client request from a manager cannot edit a completed sale.
