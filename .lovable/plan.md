## Restore tri-unit + total pieces stock label on cart card

Single, surgical edit in `src/pages/CreateSale.tsx` at line 665 — the stock `<span>` in the cart item's "Row 2" beside the trash icon.

### Change

Update the label to show both the B:S:P breakdown and the total pieces, separated by `/`:

- Multi-unit product (Tablet/Capsule with strip/box): `stk 1:2:5 / 55`
- Single-unit product (Syrup, Drop, Cream, etc., where B:S:P is meaningless): keep `stk 55` (no slash, no zero-zero noise).

### Implementation

Replace the current ternary with:

```tsx
{(() => {
  const total = item.medicine.stock_quantity ?? 0;
  if (looksSingleUnit(item.medicine)) return `stk ${total}`;
  const tri = totalPiecesToTriUnit(
    total,
    item.medicine.strip_per_pack,
    item.medicine.pcs_per_strip,
  );
  return `stk ${tri} / ${total}`;
})()}
```

`totalPiecesToTriUnit` already returns the `B : S : P` string from `src/lib/stockUtils.ts`, so no new helper is needed. The format string lands as `stk 1 : 2 : 5 / 55` (with the existing spaced colons that match the rest of the app).

### Out of scope

- No changes to calculation logic, types, or other components.
- The Box/Pcs toggle removal stays as-is.
