

## Plan: Fix Strength Saving & Display Across All Medicine Lists

### Problem
1. **Data saving**: `AddProduct.tsx` saves strength to `product_size` with the unit appended (e.g., `"500mg"`) but without a space. When adding from catalog, `product_size` isn't saved at all (the `strength` field from `master_medicines` is ignored).
2. **Display**: No medicine list shows the strength/dosage next to the brand name.

### Changes

#### 1. Fix data saving in `AddProduct.tsx` (line ~107)
- Change `product_size` format from `"500mg"` to `"500 mg"` (add space before unit)
- Already correctly maps to `product_size` column — just needs the space

#### 2. Save `product_size` when adding from catalog in `Inventory.tsx` (line ~200)
- In `handleAddFromCatalog`, add `product_size: med.strength || null` to the insert payload so catalog medicines get their strength saved

#### 3. Display strength next to name — create a reusable helper
- Add a small helper component `MedicineName` (inline or in a shared file) that renders:
  ```
  <span className="font-semibold text-foreground truncate">Elodep</span>
  <span className="text-xs text-muted-foreground ml-1">5 mg</span>
  ```
- Uses `product_size` (for local medicines) or `strength` (for catalog items)

#### 4. Apply to all medicine name displays

**`src/pages/Inventory.tsx`**:
- Line 401: Local inventory list — show `med.product_size` after name
- Line 467: Catalog results — already shows `med.strength` as a badge; keep as-is
- Line 548: Long-press overlay — show strength after name

**`src/pages/CreateSale.tsx`**:
- Line 380: Search dropdown results — show strength after name
- Line 421: Expanded cart item — show strength after name
- Line 480: Collapsed cart item — show strength after name
- Need to add `product_size` to the Medicine interface and fetch query

**`src/pages/ShortItems.tsx`**:
- Line 141 (table row): Show `product_size` after `item.name`
- Need to add `product_size` to fetch query and interface

**`src/pages/Invoice.tsx`**:
- Line 195: Sale item display — would need `product_size` stored on `sale_items` or fetched from medicines. Since `sale_items` doesn't have it, we skip this for now (would require schema change).

#### 5. Styling approach
- Strength text: `text-xs text-muted-foreground ml-1 font-normal flex-shrink-0`
- Wrap name + strength in `flex items-center min-w-0` with name getting `truncate` and strength staying visible

### Files Modified
- `src/pages/AddProduct.tsx` — fix space in product_size format
- `src/pages/Inventory.tsx` — save product_size from catalog, display strength in list items
- `src/pages/CreateSale.tsx` — add product_size to interface/fetch, display in search & cart
- `src/pages/ShortItems.tsx` — add product_size to fetch, display in table

### No Database Changes Needed
The `medicines.product_size` column already exists and is the correct place to store this data.

