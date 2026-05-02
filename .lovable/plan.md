## Goal

Stop gating the multi-unit (Box : Strip : Pcs) display on product type. Instead, drive it off the product's actual pack configuration — `pcs_per_strip` and `strip_per_pack`. Any product with meaningful pack data (either value > 1) gets the tri-unit treatment; everything else falls back to a simple pieces count.

## Root cause

`isTriUnitCategory()` in `src/lib/productType.ts` only returns true for `Tablet` / `Capsule`. `isSingleUnit()` in `src/lib/stockUtils.ts` wraps that. As a result, a Suppository configured with 5 pcs/strip × 2 strips/box still renders as a flat number, and the Add/Edit Product page hides the "Strip & Pack Details" section entirely for non‑tablet/capsule types.

## Fix — data-driven, not type-driven

### 1. `src/lib/stockUtils.ts` — make `isSingleUnit` look at the data

Change the signature so it accepts the medicine record (or just the two pack fields) and returns `true` only when **both** `pcs_per_strip ≤ 1` and `strip_per_pack ≤ 1` (treating null/0 as 1). Keep the old single-arg form working via overload for backwards compatibility, but the data-aware form becomes the primary path.

```ts
export const isSingleUnit = (med: {
  pcs_per_strip?: number | null;
  strip_per_pack?: number | null;
}): boolean => {
  const pps = med.pcs_per_strip ?? 1;
  const spp = med.strip_per_pack ?? 1;
  return pps <= 1 && spp <= 1;
};
```

This means:
- Suppository with 5 × 2 → multi-unit (`0 : 2 : 0`)
- Syrup bottle with no pack values → single-unit (`120 Pcs`)
- Enterogermina vial pack of 10 → multi-unit (treats pack as box, vial as pcs)

### 2. Update all call sites to pass the medicine object

- `src/pages/Inventory.tsx` — `TriUnitDisplay` (line 59), expanded "Qty / Box" label (line 495), stock add path (line 228). All three already have the full `med` in scope.
- `src/pages/CreateSale.tsx` — lines 543 and 658, swap `isSingleUnit(med.product_type…)` for `isSingleUnit(med)` / `isSingleUnit(item.medicine)`.
- `src/pages/ShortItems.tsx` — line 161, swap to `isSingleUnit(item)`.
- Catalog row at `Inventory.tsx:584` — catalog rows don't have explicit pack fields yet; keep type-based fallback there only (or compute pack from `boxSize`/`packSize` like the existing `computeStripPerPack`).

### 3. `src/lib/stockUtils.ts` — `getEffectiveStockAlert`

Currently keys off `getStandardizedType` to decide "one full box vs 2 units". Change to: if the product has pack data (`spp × pps > 1`), use one full box as the smart default; otherwise fall back to 2 units. Removes the Tablet/Capsule hardcode here too.

### 4. `src/pages/AddProduct.tsx` — show Strip & Pack Details for everyone

- Remove `const isTabletOrCapsule = isTriUnitCategory(productType)` and the `{isTabletOrCapsule && (…)}` gate around the Strip & Pack Details block (line 322). The section becomes always visible.
- The save payload (lines 186–187) currently writes `null` for these fields when not tablet/capsule. Change to: write whatever the user typed (parsed numbers), or `null` when the input is empty. Drop the `isTabletOrCapsule &&` guard.
- Update the helper hint under "Stock Alert Level" to say something neutral like "Leave empty to use a smart default based on your pack size."
- Optional polish: rename the section label from "Strip & Pack Details" to "Pack Details (optional)" so it reads naturally for vials/suppositories too. Keep the same two inputs ("Pcs per Strip", "Strips per Box") since users already understand them; for vial packs they can put 1 strip × N pcs, and for blister suppositories the existing labels match.

### 5. Keep `isTriUnitCategory` for the few places that legitimately need a type check

The Add/Edit form still uses `getFunctionalBucket` to pick the right strength input ("mg" vs "ml" vs "puffs") — that's correct and stays. We're only removing the type gate from the **stock display** and **pack-details visibility** paths.

## Files touched

- `src/lib/stockUtils.ts` — `isSingleUnit` signature change, `getEffectiveStockAlert` data-driven
- `src/pages/Inventory.tsx` — call-site updates (3 spots, plus the catalog-row fallback note)
- `src/pages/CreateSale.tsx` — call-site updates (2 spots)
- `src/pages/ShortItems.tsx` — call-site update (1 spot)
- `src/pages/AddProduct.tsx` — always show Strip & Pack Details; always persist the values

No DB schema change, no migration — `medicines.pcs_per_strip` and `strip_per_pack` already exist and accept any product type.

## Mobile QA (390 px)

The Strip & Pack Details block uses `grid-cols-2` with `gap-3` and `h-12` inputs — already mobile-tested for tablets, so it'll fit identically for any other type. The badge row in Inventory is unchanged.
