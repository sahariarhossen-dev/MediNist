

## Plan: Tri-Unit Inventory Logic (Box : Strip : Pcs)

### Overview
Implement a universal `Box : Strip : Pcs` display format across the app. Store stock as total pieces internally. Create a shared conversion utility and update Inventory, CreateSale, ShortItems, and Index pages.

### 1. Create shared utility: `src/lib/stockUtils.ts`

Global conversion function:
```
totalPiecesToTriUnit(totalPcs, stripPerPack, pcsPerStrip) → "B : S : P"
  boxes = floor(totalPcs / (stripPerPack * pcsPerStrip))
  remainder = totalPcs % (stripPerPack * pcsPerStrip)
  strips = floor(remainder / pcsPerStrip)
  pcs = remainder % pcsPerStrip
  return `${boxes} : ${strips} : ${pcs}`
```
Also: `boxesToPieces(boxes, stripPerPack, pcsPerStrip) → totalPcs` for adding inventory.

### 2. Update `src/pages/Inventory.tsx`

- Import `totalPiecesToTriUnit` and `boxesToPieces`
- **Collapsed cards**: Replace price display with tri-unit stock: `1 : 2 : 5` using high-contrast font
- **Expanded card Row 2**: Show `৳ {price}`, `pre-stock: {B:S:P}`, `Current stock: {B:S:P}` — all using tri-unit format
- **Calculation**: When user inputs N boxes, `calculatedStock = stock_quantity + boxesToPieces(N, strip_per_pack, pcs_per_strip)`. Display result as tri-unit string
- **Save**: Store the new total pieces value in `stock_quantity`

### 3. Update `src/pages/CreateSale.tsx`

- Import `totalPiecesToTriUnit`
- Search results: Replace `STK: {number}` with `STK: {B:S:P}`
- Cart expanded items: Replace `STK {number}` with tri-unit format
- Stock deduction on complete: Already subtracts quantity (pieces) — no logic change needed, just display update
- Fetch `strip_per_pack` in the medicine select query (add to interface)

### 4. Update `src/pages/ShortItems.tsx`

- Import `totalPiecesToTriUnit`
- Fetch `strip_per_pack` and `pcs_per_strip` in the query
- STK column: Display `B : S : P` instead of raw number
- Update interface to include the new fields

### 5. Update `src/pages/Index.tsx` (Dashboard)

- No direct stock display currently — the "Short Items" card shows a count. No changes needed here unless we add stock details later.

### Styling
- Tri-unit numbers: `font-mono font-bold text-foreground` for high contrast
- Colon separator: `text-muted-foreground mx-0.5` for clear visual separation
- Consistent across all pages

### Files Changed
1. `src/lib/stockUtils.ts` — NEW (conversion functions)
2. `src/pages/Inventory.tsx` — tri-unit display + calculation
3. `src/pages/CreateSale.tsx` — tri-unit stock display
4. `src/pages/ShortItems.tsx` — tri-unit STK column

