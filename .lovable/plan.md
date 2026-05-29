# Fix: Product Target Progress Stuck at 0

## Root Cause

A timezone bug in the frontend `firstOfMonth()` helper. It builds a *local-midnight* `Date` for the 1st of the month, then calls `.toISOString().slice(0,10)`. In Bangladesh (UTC+6) the UTC instant is the **previous day**, so for May 2026 the value written to `product_targets.target_month` is **`2026-04-30`** instead of `2026-05-01`.

Confirmed in the DB:

```
medicine: Anadol SR
target_quantity: 30
current_progress: 0
target_month: 2026-04-30   ← wrong, should be 2026-05-01
```

The Postgres trigger that increments progress (`increment_product_target_progress`) computes the bucket with `date_trunc('month', _occurred_at)::date`, which yields `2026-05-01` for a May sale. The `UPDATE … WHERE target_month = v_month` therefore matches no row, and progress stays at 0.

The list query also calls `firstOfMonth()`, so the (wrongly-dated) row is still *visible* in the UI — which is why the target appears but never advances. All roles are affected because the bug is in the shared insert path, not in role-based logic.

## Fix

### 1. Frontend — `src/components/staff/AddProductTargetSheet.tsx` and `src/components/staff/ProductTargetsList.tsx`

Replace `firstOfMonth()` in both files with a timezone-safe string builder:

```ts
const firstOfMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};
```

No other component changes needed — the trigger already does the aggregation correctly once the month key matches.

### 2. Migration — repair existing data

- Normalize any `product_targets.target_month` that is the last day of a month to the first of the following month: `target_month := date_trunc('month', target_month + interval '2 day')::date`. This safely converts `2026-04-30` → `2026-05-01` without touching legitimate `YYYY-MM-01` rows.
- Recompute `current_progress` for every target in the current month by summing `sale_items.quantity` for matching `(pharmacy_id, user_id, medicine_id)` across completed sales whose `date_trunc('month', sales.created_at)` equals the target month.
- Set `achieved_at = now()` where `achieved_at IS NULL AND current_progress >= target_quantity`, clear it otherwise.

After the migration, Anadol SR should jump to the actual sold quantity, and any future sale will increment progress in real time via the existing triggers.

## Out of scope

- No changes to RLS, the trigger functions, or the search RPC.
- No changes to other pages (Inventory, ShortItems, CreateSale).
