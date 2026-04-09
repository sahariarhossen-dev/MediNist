

## Plan: Add Strip/Pack Fields for Tablet & Capsule

### What Changes

**File: `src/pages/AddProduct.tsx`**

1. **New state variables**: `pcsPerStrip` and `stripPerBox` (strings, default "")
2. **Restore from location.state** and **pass to /add-company navigation**
3. **Conditional UI**: When `productType` is "Tablet" or "Capsule", show a new section after the Strength field:
   - Two inputs side-by-side using `grid grid-cols-2 gap-3`
     - "Pcs per Strip" (placeholder "eg. 10")
     - "Strips per Box" (placeholder "eg. 5")
   - Below them, a read-only "Total Box Size" display showing `pcsPerStrip × stripPerBox = N pcs` (auto-calculated, shown only when both values are filled)
4. **Payload mapping**: Add `pcs_per_strip` and `strip_per_pack` (existing DB columns) to the save payload when type is Tablet/Capsule; set to `null` otherwise

### DB Columns Used (already exist)
- `medicines.pcs_per_strip` (integer, nullable)
- `medicines.strip_per_pack` (integer, nullable)

No database migration needed.

### Styling
- Side-by-side grid: `grid grid-cols-2 gap-3` — stacks naturally on very narrow screens via inputs' `w-full`
- Total display: small muted text below the grid row
- Consistent `rounded-xl bg-muted border-0 h-12` inputs

