

## Plan: Dynamic Quantity Display Based on Product Type

### Problem
Currently, all medicines show the Box:Strip:Pcs tri-unit display and use `boxesToPieces` for stock input — even for Syrups, Creams, Injections, etc., where this makes no sense.

### Helper Function
Add an `isSingleUnit` helper in `src/lib/stockUtils.ts`:
```ts
export const isSingleUnit = (productType: string | null): boolean => {
  const triUnitTypes = ["tablet", "capsule"];
  return !triUnitTypes.includes((productType || "").toLowerCase());
};
```

### Changes to `src/pages/Inventory.tsx`

**1. TriUnitDisplay component** — add a conditional branch:
- If `isSingleUnit(productType)` → render just `"{totalPcs} Pcs"` (plain text, no Box:Strip breakdown)
- If Tablet/Capsule → keep current `Box : Strip : Pcs` format

**2. Inventory list (non-expanded, line ~428-430)**:
- Use the updated TriUnitDisplay with `productType` prop

**3. Expanded stock input (line ~409-426)**:
- For single-unit types: show one input labeled "Qty" that directly adds pieces (no box conversion)
- For Tablet/Capsule: keep current "Boxes" input with `boxesToPieces` conversion

**4. Expanded detail bar (line ~434-444)**:
- For single-unit: show `pre-stock: N Pcs` and `Current: N Pcs`
- For Tablet/Capsule: keep tri-unit display

**5. `handleConfirmStock` (line ~173)**:
- For single-unit: add raw input value as pieces (no `boxesToPieces` conversion)
- For Tablet/Capsule: keep existing box→pieces logic

**6. `getCalculatedStock` (line ~167)**:
- Same conditional: single-unit adds raw number, Tablet/Capsule uses `boxesToPieces`

**7. Catalog "Add" expanded section (line ~490-511)**:
- Already shows a simple "Qty (pcs)" input — no change needed here

### Changes to `src/pages/ShortItems.tsx`
- Use `isSingleUnit` to show either plain quantity or tri-unit display in the stock alerts table

### Files Modified
- `src/lib/stockUtils.ts` — add `isSingleUnit` helper
- `src/pages/Inventory.tsx` — conditional display & input logic
- `src/pages/ShortItems.tsx` — conditional stock display

