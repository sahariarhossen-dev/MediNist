## Goal

Stop deciding "show strips/box fields" and "tri-unit vs single-unit" from the `product_type` string (`Tablet`/`Capsule` → tri-unit, everything else → single-unit). Instead, drive that purely from each medicine's actual packaging data (`pcs_per_strip`, `strip_per_pack`) — the same shape the master JSON catalog already uses. A Syrup with `strip_per_pack=5` shows the box field; a Tablet sold as a single piece shows only Qty.

Note: there is no `src/components/ProductForm.tsx` in this repo — the equivalent screen is `src/pages/AddProduct.tsx` (Add + Edit). That is what gets refactored.

## Pack-mode rules (single source of truth)

New helper in `src/lib/stockUtils.ts`:

```ts
type PackMode = "single" | "strip" | "box" | "full";

getPackMode({ pcs_per_strip, strip_per_pack }) // pure function
```

| pcs_per_strip | strip_per_pack | mode   | UI shown                | Stock unit
|---------------|----------------|--------|-------------------------|-----------
| ≤1 / null     | ≤1 / null      | single | none (Qty only)         | Pcs
| >1            | ≤1 / null      | strip  | "Pcs per Strip"         | Strip-based
| ≤1 / null     | >1             | box    | "Strips per Box"        | Box-based
| >1            | >1             | full   | both fields             | Full tri-unit

`isSingleUnit(med)` becomes `getPackMode(med) === "single"` — accepts the medicine record, not the product_type string.

`totalPiecesToTriUnit*` already works generically; no math change needed (it falls back to 1 when either factor is null, which naturally degrades to single-unit display). We just stop gating it by `isTriUnitCategory(product_type)`.

## Changes

### 1. `src/lib/stockUtils.ts`
- Add `PackMode` + `getPackMode(med)`.
- Replace `isSingleUnit(productType)` signature with `isSingleUnit(med: { pcs_per_strip?, strip_per_pack? })`. Keep a thin overload accepting just numbers for the few call sites that already destructure.
- Update `getEffectiveStockAlert`: smart default = "1 box" whenever `pcs_per_strip * strip_per_pack > 0`, else `2`. Drop the `Tablet/Capsule` branch.

### 2. `src/pages/AddProduct.tsx` (Add + Edit Product)
- Remove `isTabletOrCapsule = isTriUnitCategory(productType)`.
- Compute `packMode` from current form state (`pcsPerStrip`, `stripPerBox`).
- Always render the Strip & Pack Details section, but:
  - show "Pcs per Strip" input when user wants strip data (always available)
  - show "Strips per Box" input (always available)
  - show the "Total Box Size = a × b = N pcs" hint only when both > 1
- Save logic: persist `pcs_per_strip` / `strip_per_pack` whenever the user entered values >1, regardless of product_type. Drop the `isTabletOrCapsule &&` guard on the payload.
- Edit mode: already hydrates from DB row → fields just appear when row has data. No product_type coupling needed.

### 3. `src/pages/Inventory.tsx`
- Replace every `isSingleUnit(med.product_type)` call with `isSingleUnit(med)`.
- Box-vs-Qty label and the add-stock math switch on `getPackMode(med)` instead of category.
- `TriUnitDisplay` keeps rendering; when mode is `single` show plain Pcs.

### 4. `src/pages/ShortItems.tsx` & `src/pages/CreateSale.tsx`
- Same swap: `isSingleUnit(med)` instead of `isSingleUnit(med.product_type | unit_format)`.
- All select queries already pull `pcs_per_strip, strip_per_pack`, so no schema work.

### 5. `src/pages/CatalogSearch.tsx`
- When importing a master_medicines row, pass through `pcs_per_strip` / `strip_per_pack` directly from the JSON. Don't synthesize them from `product_type`. (Already mostly the case — verify the import path.)

### 6. Keep `productType.ts` for what it actually does
`isTriUnitCategory`, `getFunctionalBucket` etc. remain for **strength input label** ("mg" vs "ml" vs "puffs") and chip colors — those genuinely depend on form factor. They are no longer used to decide pack visibility or stock math.

## Out of scope
- DB schema changes — `medicines.pcs_per_strip` / `strip_per_pack` already exist and are nullable.
- Backfilling existing rows. Old Tablet rows with NULL pack fields will simply render as single-unit until edited; that matches the new rule and is the user's intent.
