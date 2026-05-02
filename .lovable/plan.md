## Goal

Treat powder-based products (Effervescent Powder, Powder, Sachet, anything with a "container" pack) as **single-unit inventory** — never strip/box. Hide the strip/box fields when editing them, label the unit as "Container" or "Sachet", and fix the catalog parser that mistakenly turns `100 gm container` into `pcs_per_strip = 100`.

## Changes

### 1. `src/lib/productType.ts` — new powder helpers

Add two pure helpers used everywhere else:

- `isPowderType(raw)` → `true` when the product_type / unit_format string contains `powder`, `sachet`, `granule`, or `effervescent` (case-insensitive).
- `detectPowderUnit(packSize)` → returns `"Sachet"` if `packSize` matches `/sachet/i`, otherwise `"Container"` if it matches `/container|jar|bottle|tin|tub/i`, otherwise `"Container"` as default for powder products. Used as the visible unit label.

Also add `Powder` to the `StandardCategory` union and `STANDARD_CATEGORIES` list, plus a CATEGORY_PATTERNS entry `{ category: "Powder", pattern: /\b(powder|sachet|granules?|effervescent)\b/i }` placed **after** Capsule/Tablet/Syrup so things like "Dry Powder Inhalation Capsule" still bucket as Capsule. Add a chip color (orange) and include Powder in `SEED_PRODUCT_TYPES`.

### 2. `src/lib/stockUtils.ts` — powder forces single-unit

`isSingleUnit({ pcs_per_strip, strip_per_pack, product_type, unit_format })`:
- If `isPowderType(product_type || unit_format)` → return `true` unconditionally.
- Otherwise keep the current data-driven rule (pps/spp).

`getEffectiveStockAlert`: for powder products skip the "one full box" default; fall back to a flat 2 units (since strip/box numbers are meaningless for powders).

### 3. `src/pages/Inventory.tsx` — fix catalog parser & display

In `parsePackSize`, return `null` when the string contains words that mean "single container" (`container|jar|bottle|tin|tub`) — even if a number is present, so `100 gm container` no longer becomes `pcs_per_strip = 100`. Same for `computeStripPerPack` (return `null` for these).

When adding from catalog (`handleAddFromCatalog`):
- If `isPowderType(med.format)` or pack_size indicates a container/sachet → set `pcs_per_strip = null`, `strip_per_pack = null`, and treat the entered quantity as raw single units (no `boxesToPieces`).

Pass `product_type` / `unit_format` into every `isSingleUnit({...})` call site (cards, expanded row, both inventory and catalog sections) so the helper can short-circuit on powder.

In the catalog card, when the row is powder, render `"<total> <unit> | <pack_size>"` (e.g. `5 Containers | 100 gm`) instead of the strip-based label.

### 4. `src/pages/CreateSale.tsx` & `src/pages/ShortItems.tsx`

Update every `isSingleUnit(med)` call to pass the full med object (already does — just verify product_type/unit_format are included in the select, which they already are in CreateSale; add `unit_format` to the ShortItems select). For powders, the existing `isSingleUnit(item) ? "{n} Pcs" : ...` branch will now show the single-unit form. Replace the literal "Pcs" suffix with the resolved unit from `detectPowderUnit(...)` when the product is powder (e.g. "5 Containers").

### 5. `src/pages/AddProduct.tsx` — hide strip/box for powders

- Compute `isPowder = isPowderType(productType)` from current form state.
- When `isPowder`:
  - Hide the **Pack Details** (`Pcs per Strip`, `Strips per Box`) block.
  - Show a new **Unit Type** select with options `Container`, `Sachet`, `Jar`, `Bottle`, `Tin`. Default to `detectPowderUnit(product_size)` or `"Container"`.
  - Persist the chosen unit into `unit_format` (e.g. `"Effervescent Powder — Container"`); leave `pcs_per_strip` and `strip_per_pack` as `null`.
- Update the stock-alert helper text so it doesn't mention "1 full box" for powders.

### 6. Backward compatibility

Existing powder rows that already have bogus `pcs_per_strip = 100` from the old parser will still render correctly because `isSingleUnit` now short-circuits on `isPowderType`. No data migration required, but the user can re-save the product to clear the stale numbers.

## Files to edit

- `src/lib/productType.ts`
- `src/lib/stockUtils.ts`
- `src/pages/Inventory.tsx`
- `src/pages/AddProduct.tsx`
- `src/pages/CreateSale.tsx`
- `src/pages/ShortItems.tsx`
