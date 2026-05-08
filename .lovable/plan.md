## Goal
Make the inventory `Add Stock` input behave exactly per spec:
- Single number → `num * strip_per_pack * pcs_per_strip` (Box fallback, always — even for single-unit products where spp/pps default to 1, so result stays `num`).
- `b:s:p` → `b*spp*pps + s*pps + p`.
- Label flips to `B:S:P` the instant a `:` is typed.
- Field never loses caret position or "resets" while typing.

## File
`src/pages/Inventory.tsx`

## Changes

### 1. Fix the focus loop (line 519)
The current `ref={(el) => { if (el && isExpanded) setTimeout(() => el.focus(), 50); }}` runs on every render, re-focusing the input on every keystroke and pushing the caret to the end. Replace with a one-shot autofocus that fires only when the row first expands:

- Track the previously expanded id with a `useRef<string | null>(null)`.
- In the ref callback, only call `el.focus()` when `expandedId !== prevExpandedRef.current`, then update the ref.
- Alternatively (simpler): use the native `autoFocus` prop on `<Input>` — it only fires on mount, which is exactly what we want since the input is conditionally rendered when `isExpanded` becomes true. Drop the `ref` entirely.

Going with the `autoFocus` approach — minimal diff, no new refs.

### 2. Tighten `parseStockInput` (lines 226–244)
Rewrite to match the spec verbatim and stop swallowing parse errors:

```ts
const parseStockInput = (raw: string, med: Medicine) => {
  const value = (raw ?? "").trim();
  if (!value) return { addedPieces: 0, isTriple: false };

  const spp = med.strip_per_pack || 1;
  const pps = med.pcs_per_strip || 1;

  if (value.includes(":")) {
    const [bRaw = "", sRaw = "", pRaw = ""] = value.split(":");
    const b = Math.max(0, parseInt(bRaw, 10) || 0);
    const s = Math.max(0, parseInt(sRaw, 10) || 0);
    const p = Math.max(0, parseInt(pRaw, 10) || 0);
    return { addedPieces: b * spp * pps + s * pps + p, isTriple: true };
  }

  const num = Math.max(0, parseInt(value, 10) || 0);
  // Always Box-fallback per spec. For single-unit products spp=pps=1 → num.
  return { addedPieces: num * spp * pps, isTriple: false };
};
```

Removes the `isSingleUnit` branch (no longer needed — the `|| 1` defaults make it equivalent for single-unit products) and the `boxesToPieces` import dependency for this path.

### 3. Lock the label to colon presence (line 514)
Currently: `const label = isTriple ? "B:S:P" : isSingleUnit(med) ? "Qty" : "Box";`
`isTriple` already comes from `value.includes(":")`, so the label flips the moment the user types `:`. No change needed — this already works correctly once #1 stops stealing the caret.

### 4. Verify `unitInputs` state preservation
`setUnitInputs((prev) => ({ ...prev, [med.id]: cleaned }))` is already correct — state is keyed by med id and never reset on blur/focus. The only thing that was making it "feel" reset was the focus-loop pushing the caret. Fixed by #1.

## Validation
Spp=10, pps=10 product:
- `1` → 1*10*10 = 100 pcs
- `0:1:0` → 0 + 1*10 + 0 = 10 pcs
- `1:2:3` → 100 + 20 + 3 = 123 pcs
- `:1:` → 0 + 10 + 0 = 10 pcs
- `5` then keep typing `:` → label flips to `B:S:P` immediately, caret stays put, value becomes `5:`.

Single-unit product (spp=0, pps=0 → defaults 1,1):
- `5` → 5 pcs (unchanged).

## Out of scope
Catalog "Add" quantity field, stockUtils helpers, DB schema.