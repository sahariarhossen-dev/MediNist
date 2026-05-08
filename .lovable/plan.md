## Goal
Let the inventory "Add Stock" input accept a triple-unit value `Box:Strip:Piece` (e.g. `0:1:0`) in addition to the current single-number behavior. Single number with no colon keeps existing semantics (treated as Boxes for multi-unit products, Pieces for single-unit).

## Files to change
Only `src/pages/Inventory.tsx`.

## Changes

### 1. New parser helper (top of file, near other helpers)
Add a small helper that converts the raw input string into total added pieces using the medicine's `strip_per_pack` and `pcs_per_strip`:

- If string contains `:` → split into up to 3 segments `[boxes, strips, pcs]`. Missing segments default to 0. Non-numeric/negative → treated as 0.
  - `addedPieces = boxes * (strip_per_pack||1) * (pcs_per_strip||1) + strips * (pcs_per_strip||1) + pcs`
- Else (no colon) → fall back to existing logic via `boxesToPieces` for multi-unit, raw number for single-unit (reuse `isSingleUnit`).

Return `{ addedPieces, isTriple, valid }` so the UI can disable the confirm button when input is empty / parses to 0.

### 2. Update `getCalculatedStock` and `handleConfirmStock` (around lines 226–247)
Replace the current `Number(unitInputs[med.id])` + `boxesToPieces` math with a call to the new helper. The Supabase update keeps the same shape: `stock_quantity = existing + addedPieces`. No schema change.

### 3. Update the input UI (around lines 493–512)
- Change `<Input type="number">` to `type="text"` with `inputMode="numeric"` and `pattern="[0-9:]*"` so the colon is allowed on mobile keyboards.
- Update `placeholder` to `"B:S:P e.g. 0:1:0"` (kept short to fit the 16-px wide input — widen `w-16` to `w-24` to fit).
- Keep the small left-side label, but make it dynamic: show `"B:S:P"` when input contains `:`, otherwise the existing `"Box"` / `"Qty"` label, so the user always knows how the number will be interpreted.
- Add a `title` tooltip on the input: `"Box:Strip:Piece (e.g. 0:1:0 = 1 strip). Single number = Boxes."`
- Strip any disallowed characters in `onChange` (`value.replace(/[^0-9:]/g, "")`).
- Disable the confirm button when parsed `addedPieces <= 0`.

### 4. Live preview row (lines 519–531)
The existing "pre-stock / Current" row already renders the new total via `getCalculatedStock`, so it automatically reflects the parsed B:S:P value — no change needed beyond wiring the helper.

## Out of scope
- The "Add from Catalog" quantity field (line 594) stays single-number for now, since the user's request is specifically about the inventory Add Stock input.
- No DB migration; `stock_quantity` already stores total pieces.

## Validation steps after implementing
1. Single-unit medicine: type `5` → adds 5 pcs (unchanged).
2. Multi-unit medicine (e.g. 10 strips × 10 pcs): type `2` → adds 200 pcs (unchanged "Box" fallback).
3. Same medicine: type `0:1:0` → adds 10 pcs.
4. Same medicine: type `1:2:3` → adds 100 + 20 + 3 = 123 pcs.
5. Type `abc` or empty → confirm button disabled, no DB write.
