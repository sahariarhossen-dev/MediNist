## Goal

Fix stock-display bug where non-strip products (Syrups, Eye Drops, Injections, Ointments, Suppositories) get rendered as `0 • 3 • 0` instead of a single number. Root cause: the catalog→inventory sync parses `pack_size` numerically regardless of whether it actually describes a strip, so a "100 ml bottle" becomes `pcs_per_strip = 100` and the UI then treats the product as multi-tier.

The display layer (`src/lib/stockUtils.ts → getPackMode`) is already data-driven and correct — it returns `single` only when both `pcs_per_strip ≤ 1` and `strip_per_pack ≤ 1`. So the fix is at the sync layer: only emit strip/box numbers when `pack_size` actually contains the word "strip".

## Changes

### 1. `src/lib/stockUtils.ts` — add a single source of truth for catalog parsing

Add and export:

```ts
export interface MasterPackInput {
  pack_size: string | null;
  box_size: string | null;
}

export interface ParsedCatalogPack {
  pcs_per_strip: number;   // 1 when product has no strip
  strip_per_pack: number;  // 1 when product has no strip
  has_strips: boolean;
}

export const parseCatalogPack = (m: MasterPackInput): ParsedCatalogPack => { ... }
```

Rules:
- `hasStrips = /strip/i.test(pack_size ?? "")`
- `pcs_per_strip = hasStrips ? max(1, parseInt(pack_size)) : 1`
- `boxNum = max(1, parseInt(box_size ?? "1"))`
- `strip_per_pack = hasStrips ? max(1, floor(boxNum / pcs_per_strip)) : 1`

Result: non-strip products store `(1, 1)` → `getPackMode` returns `"single"` → existing `TriUnitDisplay` / `ShortItems` / `CreateSale` rows automatically render a single number. No display-side changes needed.

### 2. `src/pages/CatalogSearch.tsx` — use the new helper

- Delete the local `parsePackSize` + `computeStripPerPack`.
- Replace the insert payload's `pcs_per_strip` / `strip_per_pack` with `parseCatalogPack(med)`.
- Keep the `quantity` input meaning "pieces" (consistent with current behavior).

### 3. `src/pages/Inventory.tsx` — same swap inside `handleAddFromCatalog`

- Replace the local `parsePackSize` + `computeStripPerPack` with `parseCatalogPack(med)`.
- Keep the existing branch: if the parsed product is multi-tier (`!isSingleUnit(...)`) the input field is interpreted as "boxes" and converted via `boxesToPieces`; otherwise it stays as pieces. With the new parser, Syrups/Eye Drops/Injections naturally fall into the single-unit branch.
- Leave the `TriUnitDisplay` component untouched — it already does the right thing once `pcs_per_strip` / `strip_per_pack` reflect reality.

### 4. Mobile responsiveness (web — not React Native)

The `numberOfLines={1}` / `ellipsizeMode="tail"` API is React Native only and not applicable here. Verify that the existing `truncate` + `min-w-0` / `flex-shrink-0` classes on brand name, generic name and company name in `CatalogSearch.tsx` and `Inventory.tsx` rows still hold; tighten only if a row breaks at 390px width. No layout rewrite planned.

### 5. No DB migration

`has_strips` is purely derived (`pcs_per_strip > 1`). The `medicines` table already has `pcs_per_strip` and `strip_per_pack`; no new column required.

## Files touched

- `src/lib/stockUtils.ts` — add `parseCatalogPack` helper (additive, no behavior change to existing exports).
- `src/pages/CatalogSearch.tsx` — use new helper in the insert path.
- `src/pages/Inventory.tsx` — use new helper in `handleAddFromCatalog`; drop local parsers.

## Verification

After implementation, re-add from catalog and confirm in Inventory / Search / Short Items / Create Sale:
- "Alendon" (Tablet, `10s strip`, box `30s`) → stock renders as `B • S • P`.
- "Aerovil Syrup" (`100 ml bottle`, box `1`) → stock renders as a single number.
- "Abevmy" (Injection, `1 vial`, box `1s`) → stock renders as a single number.
- Existing inventory rows already in the DB with bad `pcs_per_strip` from earlier syncs will keep their stored values; only newly synced items get the fixed numbers. Call this out to the user — offer a follow-up backfill if they want to clean historical rows.
