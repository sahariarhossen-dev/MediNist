# Product-Specific Targets & Incentives

Add a per-medicine sales target system. Admins assign targets like "Sell 50 packs of Napa Extend → ৳500 bonus" to a staff member; progress increments automatically with each completed sale; staff see live progress on their Profile.

## 1. Database

**New table `product_targets`** (migration):

| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| pharmacy_id | uuid NOT NULL | scopes via RLS |
| user_id | uuid NOT NULL | the staff member |
| medicine_id | uuid NOT NULL | references inventory medicine |
| medicine_name | text NOT NULL | snapshot for display if med is renamed/deleted |
| target_quantity | integer NOT NULL CHECK (> 0) | units to sell |
| current_progress | integer NOT NULL DEFAULT 0 | auto-incremented |
| incentive_description | text NOT NULL | e.g. "৳500 Bonus", "Gift Box" |
| target_month | date NOT NULL | first day of month (e.g. 2026-04-01) |
| created_by | uuid NOT NULL | admin who set it |
| achieved_at | timestamptz NULL | set when progress first crosses target |
| created_at, updated_at | timestamptz | defaults |

Unique constraint: `(pharmacy_id, user_id, medicine_id, target_month)` — one active target per staff/medicine/month.

Index: `(pharmacy_id, user_id, target_month)`.

**RLS policies:**
- SELECT: members of the pharmacy (`pharmacy_id = get_user_pharmacy_id()`) — staff can see their own + admins see all.
- INSERT / UPDATE / DELETE: admin only (`is_pharmacy_admin()`).

**Auto-increment trigger** on `sale_items` AFTER INSERT (SECURITY DEFINER, bypasses RLS write restriction):
```
For each new sale_item row:
  fetch parent sale: pharmacy_id, user_id, status, created_at
  if status != 'completed' → return  -- only count completed sales
  compute month = date_trunc('month', sale.created_at)::date
  UPDATE product_targets
    SET current_progress = current_progress + NEW.quantity,
        achieved_at = CASE
          WHEN achieved_at IS NULL
           AND current_progress + NEW.quantity >= target_quantity
          THEN now() ELSE achieved_at END,
        updated_at = now()
    WHERE pharmacy_id = sale.pharmacy_id
      AND user_id     = sale.user_id
      AND medicine_id = NEW.medicine_id
      AND target_month = month;
```
Also add an AFTER UPDATE trigger on `sales` so that when a draft transitions to `completed`, we backfill progress for its existing sale_items (single statement summing per medicine).

This means the existing `CreateSale.tsx` flow needs **no client changes** — progress updates server-side.

## 2. Admin View — `StaffPerformanceDetails.tsx`

New section "**Product Targets & Incentives**" placed after the Achievements card. Visible only when `canEdit` (admin).

**Active Targets list** (current month, sorted by progress %):
- Card per target with:
  - Medicine icon (Pill) + name (bold) + small chip "x of y units"
  - Linear progress bar (`<Progress />`):
    - Blue (`bg-blue-500`) while in progress
    - Green (`bg-emerald-500`) when achieved
  - Right side: incentive text in muted small caps + "🏆 Achieved" green badge if `achieved_at` set
  - Trash icon (admin only) → soft confirm → DELETE
- Empty state: "No product targets set for this month."

**"+ Add Target" button** → opens a Sheet (bottom):
- Product picker: reuse `search_medicines` RPC (same pattern as CreateSale) — debounced search with dropdown showing name/company.
- Target Quantity: numeric input (min 1).
- Incentive / Reward: free-text input, placeholder "e.g. ৳500 Bonus or Gift Box".
- Target Month: defaults to current month, read-only (admins manage one month at a time; future enhancement can allow selection).
- Save → INSERT into `product_targets`. On unique-violation, toast "Target already exists for this product this month."

## 3. Staff View — `Profile.tsx`

New "**My Targets**" card after the existing Monthly Target card, only when the staff has at least one active target this month.

Per target row:
- Pill icon + medicine name + "Achieved 🏆" badge (emerald) when complete
- Below: linear progress bar (blue/green per state)
- Below progress: `{current}/{target} sold · {incentive_description}` in xs muted text

Read-only — no edit/delete affordances for staff.

Empty state hidden (don't render the card if zero targets).

## 4. New shared component

`src/components/staff/ProductTargetsList.tsx`
- Props: `{ pharmacyId, userId, isAdmin, onChange? }`
- Fetches `product_targets` for current month + given user_id
- Renders the list (used by both Profile and StaffPerformanceDetails)
- Admin variant accepts an `onAdd` slot or shows internal Add button

`src/components/staff/AddProductTargetSheet.tsx`
- The admin "Add Target" bottom sheet described above

## 5. Visual style

- Cards: existing `rounded-3xl bg-white shadow-sm border border-gray-100`
- Progress bar: shadcn `<Progress />` with custom indicator color via className override (blue / emerald)
- Achieved badge: `bg-emerald-100 text-emerald-700 rounded-full text-[10px] px-2 py-0.5`
- Medicine icon: `Pill` from lucide in a tinted circle (`bg-sky-100 text-sky-700`)

## Technical notes

- The trigger runs as SECURITY DEFINER and only updates rows matching the sale's pharmacy_id/user_id, so no RLS bypass risk.
- `target_month` stored as `date` (first of month) — fetch with `eq("target_month", firstOfMonthDate)`.
- `current_progress` is materialized (not computed on read) so list rendering is a single query.
- Backfill on existing data is intentionally skipped — targets created today only count sales from today onward, which matches "monthly target" semantics for the current month.
- No changes to `CreateSale.tsx`, `sale_items` schema, or existing RLS.
