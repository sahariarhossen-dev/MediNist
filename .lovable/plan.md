## Goal

Replace the hardcoded 7-item Product Type list with a **dynamic, self-extending** system. New formats like "Eye Drop", "Pediatric Drops", or "MDI" should:
1. Be auto-saved as the product's `product_type` during catalog import (already partially working — needs tightening).
2. Appear in the Add/Edit Product dropdown automatically.
3. Be addable on the fly from the Add/Edit screen without leaving the page.

No new database tables are required — `medicines.product_type` already stores the canonical type, so distinct values from this column become the dynamic option list.

## What changes

### 1. `src/lib/productType.ts` — strengthen functional mapping

Update `toFunctionalType()` so the import path is explicit:
- Contains "tablet" → `"Tablet"`
- Contains "capsule" → `"Capsule"`
- Contains "syrup" or "suspension" → `"Syrup"`
- Otherwise → return the **trimmed verbatim format** (e.g. `"Eye Drop"`, `"Pediatric Drops"`, `"Metered-Dose Inhaler (MDI)"`). This becomes the new `product_type`.

`detectFunctionalTypeFromName()` keeps its current behavior (used for auto-detect from medicine name on Edit hydration).

Add a new helper:
```ts
fetchPharmacyProductTypes(pharmacyId): Promise<string[]>
```
Queries `medicines.product_type` distinct for the pharmacy, merges with the seed list (`Tablet, Capsule, Syrup, Injection, Cream, Suspension, Ointment`), de-duplicates case-insensitively, and returns sorted with seeds first.

### 2. `src/pages/AddProduct.tsx` — dynamic dropdown + custom add

- Replace the hardcoded `productTypes` array with state populated from `fetchPharmacyProductTypes()` on mount.
- If the medicine being edited has a `product_type` not yet in the fetched list (rare race / freshly-imported), inject it into the options so the Select can render its current value.
- Add an **"+ Add new type…"** item at the bottom of the dropdown. Selecting it opens a small inline input (or `prompt`-style row) where the user types a custom type; on confirm it's appended to local state and selected immediately. It will be persisted to the DB as soon as the product is saved (because `product_type` is just a column).
- Keep `getStrengthConfig` keyed off **functional buckets**:
  - If `productType` matches Tablet/Capsule/Injection → mg input + strip/box section
  - If matches Syrup/Suspension → ml input
  - If matches Cream/Ointment → gm input
  - Otherwise (Eye Drop, MDI, etc.) → no strength input shown, no strip/box section. Stock & MRP still work normally.
- On save, write `product_type` and `unit_format` exactly as selected (custom types flow through unchanged).

### 3. `src/pages/CatalogSearch.tsx` — no behavior change needed

Already calls `toFunctionalType(med.format)`. After step 1, unknown formats like `"Eye Drop"` will be saved verbatim into `product_type`, which is what we want. The newly-saved type immediately becomes a distinct value the dropdown will pick up next time `fetchPharmacyProductTypes` runs.

### 4. `src/pages/Inventory.tsx` — no schema change

Continues to use `getDisplayFormat()` for UI and `isSingleUnit(product_type)` for math. `isSingleUnit` already returns true for non-Tablet/Capsule types, so Eye Drop / MDI / Drops will display as `"N Pcs"` correctly.

### 5. Refresh on return

When the user saves a new product with a custom type and navigates back to Add Product later, the dropdown re-fetches on mount, so the new type appears automatically. No realtime subscription needed — fetching on mount is sufficient and matches existing patterns in the app.

## Out of scope

- No dedicated `product_categories` table. The distinct-query approach is simpler, requires no migration, and meets the requirement "becomes available for future products".
- No global cross-pharmacy type sharing — each pharmacy's dropdown reflects its own inventory plus the seed list.

## Files touched

- `src/lib/productType.ts` — add `fetchPharmacyProductTypes`, tighten `toFunctionalType` pass-through.
- `src/pages/AddProduct.tsx` — dynamic options state, inline "Add new type" UI, functional-bucket strength config.

## Verification

After implementation:
1. Import an "Eye Drop" from the catalog → opens in inventory with `product_type = "Eye Drop"`, displayed as `"Eye Drop"`.
2. Open Add Product → dropdown shows seeds + every distinct type from the pharmacy (including "Eye Drop").
3. Type a brand-new type via "+ Add new type…" → saves correctly, appears in dropdown on next visit.
4. Edit an existing "Eye Drop" product → dropdown pre-selects "Eye Drop" without strip/box fields shown.