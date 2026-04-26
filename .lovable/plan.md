## Goal

Replace the hardcoded fallback threshold of `5` with a smart, product-type-aware default that respects any user-set `stock_alert` value.

## Threshold rule (single source of truth)

Create a helper `getEffectiveStockAlert(medicine)` in `src/lib/stockUtils.ts`:

- If `stock_alert > 0` → use that exact value (in pieces).
- Else, default by `product_type` (case-insensitive):
  - **Tablet / Capsule** → `strip_per_pack × pcs_per_strip` (1 full box, in pieces). Falls back to `10` if either is missing.
  - **Everything else** (Syrup, Injection, Cream, Suspension, Ointment, unknown) → `2`.

Alert condition: `stock_quantity ≤ threshold`.

Example check: a Syrup with 5 units, no custom alert → threshold 2 → 5 ≤ 2 is false → no alert. ✓

## Files to change

**`src/lib/stockUtils.ts`** — add and export:
- `getEffectiveStockAlert({ product_type, stock_alert, strip_per_pack, pcs_per_strip })` returning the threshold in pieces.
- `isLowStock(medicine)` returning `stock_quantity ≤ threshold`.

**`src/pages/ShortItems.tsx`**
- Replace the inline `threshold = m.stock_alert && m.stock_alert > 0 ? m.stock_alert : 5` filter with `isLowStock(m)`.
- Already selects all needed columns (`stock_alert, strip_per_pack, pcs_per_strip, product_type`).

**`src/pages/Index.tsx`** (dashboard "Stock Alerts" stat)
- Update the `medicines` select to also fetch `product_type, strip_per_pack, pcs_per_strip`.
- Replace the inline threshold logic with `isLowStock(m)`.
- Change comparison from `<` to `≤` to match the new rule.

**`src/pages/Inventory.tsx`** (UI low-stock styling, if any)
- Audit row rendering for any color/badge tied to low stock; if present, switch to `isLowStock`. Currently no inline threshold exists here, so likely no visual change is needed beyond confirming.

**`src/pages/AddProduct.tsx`** (UX clarity, no logic change)
- Add helper text under the Stock Alert input: *"Leave empty to use smart defaults — 1 box for Tablet/Capsule, 2 units for others."*

## Out of scope

- No DB migration. `stock_alert` stays nullable/`0` = "use default".
- No changes to how `stock_alert` is saved (still stored in pieces, 0 means "use default").
