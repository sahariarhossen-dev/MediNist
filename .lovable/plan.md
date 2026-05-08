# Switch stock input separator from `:` to `.`

Update the inline stock input on the Inventory page so users on mobile can type `B.S.P` (boxes.strips.pieces) using the numeric/decimal keypad instead of having to find the colon character.

All changes are confined to `src/pages/Inventory.tsx`. The calculation rules and `unitInputs` state shape stay exactly the same — only the separator character and keyboard hints change.

## Changes

1. **`parseStockInput` (lines 226–240)**
   - Detect dot instead of colon: `value.includes(".")` and `value.split(".")`.
   - Same math: `totalPieces = b * strip_per_pack * pcs_per_strip + s * pcs_per_strip + p`.
   - Single number (no dot) still falls back to "boxes" and multiplies by `strip_per_pack * pcs_per_strip`.

2. **Input element (lines 514–527)**
   - `inputMode="decimal"` (gives the numeric keypad with a dot on iOS/Android).
   - `pattern="[0-9.]*"`.
   - `placeholder="B.S.P e.g. 0.1.0"`.
   - `title` updated to "Box.Strip.Piece (e.g. 0.1.0 = 1 strip). Single number = Boxes."
   - `onChange` sanitizer:
     - Strip everything except digits and dots: `replace(/[^0-9.]/g, "")`.
     - Collapse runs of consecutive dots into a single dot: `replace(/\.{2,}/g, ".")`.
     - Cap at two dots total (B.S.P has at most three segments). If a third dot is typed, drop it so existing segments aren't reshuffled.

3. **Label (line 510)**
   - `const label = isTriple ? "B.S.P" : isSingleUnit(med) ? "Qty" : "Box";`
   - Label flips to `B.S.P` as soon as the first dot is typed (already driven by `isTriple` from `parseStockInput`, which now keys off `.`).

## Out of scope

- No changes to the `medicines` table, RLS, or any other component.
- No migration of historical data — the separator was only ever a UI input format, never persisted.
- `TriUnitDisplay` (the read-only stock badge) is untouched.

Confirm and I'll apply the edit.