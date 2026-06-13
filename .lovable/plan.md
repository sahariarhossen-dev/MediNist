# Remove "Sell as" toggle from Sales / Billing

Drop the per-item Box / Strip / Pcs toggle on the cart card in `src/pages/CreateSale.tsx`. Quantities entered with `+ / − / input` will represent individual pieces directly, so prices and totals are computed at the piece level with no unit conversion.

## Scope

Single file: `src/pages/CreateSale.tsx`. No DB or other component changes — the `sales_items.quantity` column already stores pieces (we already write `getItemPieces(c)` on checkout).

## Changes

1. **Remove unit concept from `CartItem`**
   - Drop the `unit: SaleUnit` field from the `CartItem` type.
   - Delete `SaleUnit`, `getAvailableUnits`, `getDefaultUnit`, `piecesPerUnit`, and `updateItemUnit`.
   - Simplify `getItemPieces(item) → item.quantity`. (Inline it or keep the helper as a one-liner so callers don't change.)
   - All `addToCart` / prescription-add paths stop setting `unit`.

2. **Remove the toggle UI** (lines ~755–778)
   - Delete the entire `{showUnitPicker && …}` "Sell as" block.
   - Remove `availableUnits`, `showUnitPicker`, and the `unitLabel` map inside the cart `.map`.

3. **Clean up collapsed-card and expanded-card text**
   - Collapsed row: replace `{item.quantity}{showUnitPicker ? unitLabel[item.unit][0].toLowerCase() : ""}` with plain `{item.quantity}` (no unit suffix). Same for the wholesale variant.
   - Expanded row calculation already uses `pieces` — unchanged once `getItemPieces` returns `quantity`.

4. **Layout polish after toggle removal**
   - Add a touch more vertical breathing room to the expanded card (e.g. `space-y-2.5` wrapper or `mt-3` on the wholesale calc strip) so the card doesn't feel top-heavy now that the third row is gone.
   - No other visual changes.

## Acceptance

- No "Box / Strip / Pcs" buttons appear on any cart card, including multi-unit products (tablets/capsules with strip+box packaging).
- `+`, `−`, and the quantity input change pieces directly; line total = `quantity × MRP` (minus discount in wholesale).
- Checkout still writes `quantity` (= pieces) into `sales_items` and decrements `stock_quantity` by the same amount.
- Expanded card looks balanced with the toggle row gone — no awkward empty gap.
