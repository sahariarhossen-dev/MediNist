
## Important: schema already supports this

The `medicines` table already has the exact integers you described, under different names. We should reuse them, not add duplicate columns:

| You proposed | Already exists as |
|---|---|
| `units_per_package` | `pcs_per_strip` |
| `packages_per_box`  | `strip_per_pack` |
| `total_items_in_box` | `pcs_per_strip * strip_per_pack` (derived) |

`stock_quantity` is already stored in pieces. `src/lib/stockUtils.ts` already has `totalPiecesToTriUnit`, `getPackMode`, `looksSingleUnit`, `classifyCatalogPack`, etc. The Add/Edit Product form already shows "Pcs per Strip" and "Strips per Box" with the live "Total Box Size" preview.

Adding three new columns would fork the data model, break every existing dashboard, inventory and target query, and double the migration surface. The plan below keeps the existing names and fills in the gaps.

If you want the new names purely for readability, I can add them as generated views/aliases later — say the word.

## What's actually missing

1. Existing rows scraped from the catalog still have `pack_size` / `box_size` as raw strings (e.g. "14's strip", "140s", "5 ml") with `pcs_per_strip` / `strip_per_pack` left NULL. The POS treats those as single-unit.
2. POS (`CreateSale.tsx`) sells in pieces only — no Box / Strip / Pcs selector, and stock is deducted as `c.quantity` regardless of unit.
3. Dashboard / inventory tiles already render tri-unit via `totalPiecesToTriUnit` ("10 : 4 : 2"); only needs the friendlier "10 Boxes, 4 Strips, 2 Pcs" label variant in a couple of spots.

## Plan

### 1. Backfill migration (no schema change)

One-time SQL that reuses `classifyCatalogPack` logic in pure SQL:

- For rows where `pcs_per_strip IS NULL AND strip_per_pack IS NULL`:
  - Parse leading integer from `pack_size` → `pps`, from `box_size` → `box`.
  - Tablet / Capsule:
    - If `pps > 1` and `box > pps` → `pcs_per_strip = pps`, `strip_per_pack = box / pps`.
    - Else if `pps > 1` → `pcs_per_strip = pps`, `strip_per_pack = 1`.
    - Else if `box > 1` → flat box of `box` pieces: `strip_per_pack = box`, `pcs_per_strip = 1`.
  - Injection / Vial / Ampoule: `strip_per_pack = box (if >1 else 1)`, `pcs_per_strip = 1`.
  - Syrup / Suspension / Drop / Cream / Ointment / Inhaler / Spray / Solution: leave NULL (single whole unit — matches current `looksSingleUnit` rule).
- Idempotent: only touches rows where both columns are NULL.

No new columns, no GRANT changes.

### 2. POS: Box / Strip / Pcs selector + correct deduction

`src/pages/CreateSale.tsx`:

- Extend `CartItem` with `unit: "box" | "strip" | "pcs"` (default = largest available unit for that medicine: box if `strip_per_pack>1`, else strip if `pcs_per_strip>1`, else pcs).
- Below each cart row's qty stepper, add a small segmented control with the units the medicine actually supports (hidden entirely for single-unit products).
- Compute `piecesPerUnit = unit==='box' ? spp*pps : unit==='strip' ? pps : 1`.
- Line total uses `medicine.price` as the price-per-piece × `quantity * piecesPerUnit` (matches today's behavior when unit = pcs). If you'd rather price per selected unit, tell me and I'll switch it.
- Stock validation: block adding > floor(stock_quantity / piecesPerUnit) of that unit.
- On checkout, deduct `quantity * piecesPerUnit` pieces (replaces the current raw `c.quantity` subtraction) and persist `quantity * piecesPerUnit` into `sale_items.quantity` so existing reports, targets, and the activity log keep working in pieces.

### 3. Friendlier stock label

Add `totalPiecesToTriUnitWords(total, spp, pps)` in `stockUtils.ts` → "10 Boxes, 4 Strips, 2 Pcs" (skips zero parts, singularizes 1). Use it on the dashboard stock chips and inventory cards; keep the compact "B : S : P" in tight POS rows.

### 4. Out of scope (confirm before I touch)

- Renaming the three columns to your proposed names.
- Per-unit pricing (separate box price vs strip price vs piece price).
- Changing `sale_items.quantity` semantics from pieces to selected-unit count.

```text
Add to cart:  [Anadol SR]  qty [ 1 ] [ Box | Strip | Pcs ]
                                       ▲ deduct = 1 * (spp*pps) pieces
```

### Technical notes

- Files touched: `supabase/migrations/<new>.sql`, `src/pages/CreateSale.tsx`, `src/lib/stockUtils.ts`, plus the 2–3 dashboard/inventory tiles that currently show raw `stock_quantity`.
- Existing triggers (`tg_sale_item_increment_targets`, `log_sale_activity`) keep working unchanged because `sale_items.quantity` stays in pieces.
- `AddProductTargetSheet` already targets pieces — no change.
