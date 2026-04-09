

## Plan: Restructure Add New Product Form

### New Field Order
1. **Product Type** (top) — drives conditional fields below
2. **Medicine Name** — placeholder "e.g. Napa Extra"
3. **Dosage/Strength** (new field) — label and unit change based on type:
   - Tablet/Capsule/Injection → label "Strength", unit suffix "mg"
   - Syrup/Suspension → label "Volume", unit suffix "ml"
   - Cream/Ointment → label "Weight", unit suffix "gm"
   - Hidden when no type selected
4. **Company Name** — existing clickable selector
5. **MRP (৳)** — moved up from bottom
6. **Stock Alert Level** — moved to bottom

### What Gets Removed
- The conditional "Strip & Pack Details" section (strip per pack, pcs per strip)
- The conditional "Product Details" section (product size, total quantity)
- These fields are replaced by the new unified Strength/Volume/Weight input

### New State
- Add `strength` state variable (string)
- Add to form state passed to `/add-company` navigation and restored from `location.state`

### Payload Mapping
- Map `strength` → `product_size` in the save payload (reusing existing DB column)
- Remove `strip_per_pack`, `pcs_per_strip`, `stock_quantity` from manual form payload (these are only relevant for catalog imports)

### Expanded Product Types
- Add "Suspension", "Ointment" to the `productTypes` array to support the new conditional logic

### Styling
- All inputs: `rounded-xl bg-muted border-0 h-12` (consistent)
- Strength input gets a unit suffix badge inside using `relative` positioning
- Vertical `flex-col` stacking with `space-y-5`, `px-5` padding
- Fully fluid, no fixed pixel widths

### File Modified
- `src/pages/AddProduct.tsx` — reorder JSX, add strength field with conditional label/unit, expand product types, update payload

