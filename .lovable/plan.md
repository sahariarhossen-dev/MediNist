## Goal

Treat single-unit products (Syrups, Drops, Creams, full pots like Allion Gold — `box_size` = 1, no strip subdivision) differently from strip-based multi-unit products (Sefrate Capsule, Atoz Premium — `box_size` > 1 with a `pack_size` like "10s"). Single = flat integer stock + 1-click cart add at unit price. Multi = current Box • Strip • Pcs matrix.

## Current state

- `src/lib/stockUtils.ts` already exposes `getPackMode` and `isSingleUnit`, but they only look at the inventory row's `pcs_per_strip` / `strip_per_pack`. They have no awareness of the raw catalog `box_size` / `pack_size` strings.
- `src/pages/CatalogSearch.tsx` and `src/pages/Inventory.tsx` both have private `parsePackSize` + `computeStripPerPack` helpers — duplicated, not shared.
- `CreateSale` already renders stock via `isSingleUnit` and adds quantity = 1 at unit price, so single-product cart behavior is mostly correct as long as the inventory row was saved with the right pack metadata.
- The real gap: when a catalog item has `box_size` = "1" (single pot/syrup) but a non-empty `pack_size` like "30s", `computeStripPerPack` returns `floor(1/30) = 0 → null`, which is fine — but `pcs_per_strip` is still set to 30, so `isSingleUnit` returns `false` and the item incorrectly renders as a strip product.

## Changes

### 1. Single source of truth in `src/lib/stockUtils.ts`

- Export `parsePackSize(raw)` and a new `classifyCatalogPack({ pack_size, box_size, format })` that returns `{ mode: "single" | "strip" | "box" | "full", pcs_per_strip, strip_per_pack }`.
- Rule:
  - `box_size` parses to ≤ 1 → **single**: `pcs_per_strip = null`, `strip_per_pack = null` (regardless of `pack_size`, because a "30s pot" sold as one whole unit has no internal strip).
  - `box_size` > 1 and `pack_size` parses to > 1 → **full** strip+box: `pcs_per_strip = pack`, `strip_per_pack = floor(box / pack)`.
  - `box_size` > 1 with no usable `pack_size` → **box** only.
  - Anything else falls back to **single**.
- Keep `isSingleUnit` working off the resolved `pcs_per_strip` / `strip_per_pack` so existing call sites stay untouched.

### 2. Use the shared classifier everywhere

- `src/pages/CatalogSearch.tsx`: replace local `parsePackSize` / `computeStripPerPack` with `classifyCatalogPack` when inserting into `medicines`. Single products are now persisted with both pack fields `null`, which makes every downstream check correct automatically.
- `src/pages/Inventory.tsx`: same swap in the two places that compute pack info from catalog rows (around lines 359 and 680).
- `src/pages/AddProduct.tsx`: if it accepts `box_size` / `pack_size` style inputs, route them through the classifier too. (Verify during implementation; no behavior change if it already uses tri-unit fields directly.)

### 3. Stock display

Already driven by `isSingleUnit`, so once classification is corrected the displays will switch automatically:

- **Single** → flat integer (e.g. `5`, `1`) in `CreateSale` search row, `CreateSale` cart row, `Inventory` row, and `ShortItems` row.
- **Multi** → existing `Box • Strip • Pcs` matrix (e.g. `1 • 0 • 0`).

No template edits needed beyond confirming the four call sites still read the right value.

### 4. Cart add logic

`CreateSale.addToCart` already inserts `quantity: 1` at `medicine.price`. After the classifier fix, single products will have `pcs_per_strip = null`, so the +/- stepper in the cart treats the quantity as flat units (pots/bottles), exactly as requested. No code change beyond verification.

### 5. One-off data heal (optional, ask first)

Existing `medicines` rows that were imported before this fix may still have `pcs_per_strip` populated for single-unit products. We can either:

- (a) Leave them — user can re-add from catalog, or
- (b) Run a one-time SQL update to null out `pcs_per_strip` / `strip_per_pack` for rows whose source catalog entry has `box_size` ≤ 1.

I'll confirm with you before touching production data.

## Files touched

- `src/lib/stockUtils.ts` — add `parsePackSize`, `classifyCatalogPack`; keep existing exports.
- `src/pages/CatalogSearch.tsx` — use shared classifier on insert.
- `src/pages/Inventory.tsx` — use shared classifier; remove local duplicates.
- `src/pages/AddProduct.tsx` — verify and align if it handles box/pack strings.

## Verification

- Add a syrup (e.g. `box_size: "1"`, `pack_size: "100ml"`) from catalog → inventory + sales search both show flat `Qty: N`, cart adds 1 unit at unit price.
- Add a strip product (e.g. `box_size: "100s"`, `pack_size: "10s"`) → stays as `Box • Strip • Pcs`, existing tri-unit cart controls unchanged.
- `ShortItems` and the cart row both reflect the new classification automatically.
