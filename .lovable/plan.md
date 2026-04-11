

## Plan: Fix Catalog Input Logic & Edit Page Data Mapping

### Problems Found

1. **Catalog input always shows "Qty (pcs)"** — even for Tablets/Capsules. Should show "Box" and convert to pieces using `boxesToPieces`.
2. **Edit page fields are empty** — `handleEdit` passes `productSize`, `stripPerPack` but AddProduct reads `strength`, `stripPerBox`. Key name mismatch.
3. **Strength not parsed back** — `product_size` is stored as "500 mg" but needs to be split back into value ("500") and unit is auto-determined by type.

### Changes

#### File: `src/pages/Inventory.tsx`

**1. Catalog expanded input (line ~496)**: Make label dynamic based on `med.format`:
- Tablet/Capsule → label "Box", convert qty via `boxesToPieces(qty, stripPerPack, pcsPerStrip)` before saving
- Others → label "Qty (pcs)", save raw number

**2. `handleAddFromCatalog` (line ~201)**: For Tablet/Capsule, convert `catalogQty` from boxes to pieces using computed `pcsPerStrip` and `stripPerPack`. For others, save raw qty.

**3. `handleEdit` state keys (line ~259)**: Fix key names to match what AddProduct expects:
- `stripPerPack` → `stripPerBox` (AddProduct reads `s.stripPerBox`)
- `productSize` → `strength` (parse "500 mg" → "500", stripping the unit suffix)

#### File: `src/pages/AddProduct.tsx`

**4. Parse strength from `product_size`** (line ~81): When restoring from edit state, extract the numeric part from "500 mg" → set strength to "500". The unit is already auto-determined by product type via `getStrengthConfig`.

### No database changes needed.

### Summary of fixes:
- Catalog: dynamic "Box" vs "Qty" label + correct box→pieces conversion on save
- Edit: fix state key mismatches so MRP, strength, strips, pcs all populate correctly
- Strength parsing: split "500 mg" back to numeric value for the input field

