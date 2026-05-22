# Fix multi-unit display for Suppositories (and similar) in Inventory

## Root cause

`TriUnitDisplay` in `src/pages/Inventory.tsx` decides single vs. matrix purely via `isSingleUnit({ pcs_per_strip, strip_per_pack })` from `src/lib/stockUtils.ts`. That helper returns `single` whenever both numbers are `null`, `0`, or `1`. For Suppositories the master JSON often lacks usable pack/box numbers, so the card falls back to "1" instead of "1 • 0 • 0", even though structurally the product is sold in strips/boxes.

## Strategy

Move the single-vs-multi decision to a **format-keyword test** that runs first, then keep the existing pack-number math as the matrix value source. Pack numbers default to 1 when missing, so a quantity of `1` cleanly renders as `1 • 0 • 0`.

### New helper in `src/lib/stockUtils.ts`

```ts
// Strict single-unit forms — anything matching is rendered as a bare digit.
const STRICT_SINGLE_UNIT_RE =
  /\b(injection|inject|iv|im|vial|ampoule|ampule|syrup|suspension|oral\s*liquid|solution|drop|drops|spray|inhaler|inhalation|mdi|dpi|aerosol|respule|nebul\w*|cream|ointment|gel|lotion|sachet|powder)\b/i;

export const isStrictSingleUnit = (med: {
  unit_format?: string | null;
  product_type?: string | null;
  format?: string | null;
}): boolean => {
  const s = `${med?.unit_format ?? ""} ${med?.product_type ?? ""} ${med?.format ?? ""}`;
  return STRICT_SINGLE_UNIT_RE.test(s);
};
```

Add a thin wrapper used by the UI:

```ts
export const shouldDisplayAsMatrix = (med): boolean => !isStrictSingleUnit(med);
```

The existing `isSingleUnit(packInfo)` stays as-is for callers that genuinely need pack-math single detection (e.g. `handleAddFromCatalog`'s `boxesToPieces` decision).

### Update `TriUnitDisplay` (Inventory.tsx)

- Accept the medicine record (or at least `unit_format` + `product_type`) in addition to the existing pack fields.
- Decision tree:
  1. `isStrictSingleUnit(med)` → render bare `totalPcs`.
  2. Otherwise → render `boxes • strips • pcs` from `totalPiecesToTriUnitObj(totalPcs, stripPerPack || 1, pcsPerStrip || 1)`. The `|| 1` fallback guarantees `1 → 1 • 0 • 0`, `12 → 12 • 0 • 0` for products with no pack data.

### Update `src/pages/ShortItems.tsx`

Same swap: use `isStrictSingleUnit(item)` instead of `isSingleUnit(item)` when choosing between `${qty} Pcs` and `totalPiecesToTriUnit(...)`. Pass `unit_format` through the `select(...)` query so the helper has the keyword source.

## Files touched

- `src/lib/stockUtils.ts` — add `STRICT_SINGLE_UNIT_RE`, `isStrictSingleUnit`, `shouldDisplayAsMatrix`. Leave `isSingleUnit` for pack-math callers.
- `src/pages/Inventory.tsx` — `TriUnitDisplay` signature + call sites use new helper; matrix fallback uses `|| 1`.
- `src/pages/ShortItems.tsx` — query adds `unit_format`; render uses new helper.

## Out of scope

- No change to how stock is **added** (`handleAddFromCatalog`, manual Add Product). Behavior for new entries is unchanged; this is purely a display refactor as the task specifies.
- No DB migration; logic is derived from existing columns.

## Verification

1. A Suppository row in inventory with `stock_quantity = 1`, no pack numbers → renders `1 • 0 • 0`.
2. A Tablet row with `pcs_per_strip = 10, strip_per_pack = 10, stock_quantity = 100` → still renders `1 • 0 • 0`.
3. A Syrup row with `stock_quantity = 5` → still renders `5` (strict single, keyword match).
4. Mobile viewport (390px) — `TriUnitDisplay` keeps `whitespace-nowrap text-[11px]`; no layout regression.
