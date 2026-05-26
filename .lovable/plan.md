## Root cause

The `CreateSale` search row already uses the correct UI rule:

```ts
STK: {isSingleUnit(med) ? `${med.stock_quantity ?? 0} Pcs`
                       : totalPiecesToTriUnit(...)}
```

`isSingleUnit` reads from `medicines.pcs_per_strip` / `strip_per_pack`. The new `classifyCatalogPack` writes those as `null` for single products — but only for items added **after** the fix.

The rows the user is seeing (A-Phenicol Eye Drop, Ace Pediatric Drop, Alarid Eye Drop, Ace Syrup) were inserted earlier with `pcs_per_strip` populated (10, 30, 5, 60) even though their `master_medicines.box_size = "1"`. So `getPackMode` returns `"strip"` and the matrix renders.

DB confirms:

```
A-Phenicol Eye Drop  pcs_per_strip=10  strip_per_pack=null
Ace (Pediatric Drop) pcs_per_strip=30  strip_per_pack=null
Alarid (Eye Drop)    pcs_per_strip=5   strip_per_pack=null
Ace (Syrup)          pcs_per_strip=60  strip_per_pack=null
```

Master catalog for all of these: `box_size = "1"`.

No UI rewrite is needed — the rule is already there. We need to (a) heal the legacy data so existing single products flip to flat STK display, and (b) add a defensive UI fallback so any future row that slips through still renders correctly.

## Changes

### 1. Data heal migration (one-time)

Add a Supabase migration that nullifies pack fields for any `medicines` row whose matching catalog entry is a single unit (`box_size` parses to ≤ 1):

```sql
UPDATE medicines m
SET pcs_per_strip = NULL,
    strip_per_pack = NULL
FROM master_medicines mm
WHERE m.name = mm.brand_name
  AND COALESCE(m.company_name, '') = COALESCE(mm.company, '')
  AND (
    mm.box_size IS NULL
    OR mm.box_size = ''
    OR mm.box_size = 'N/A'
    OR substring(mm.box_size from '^\\s*(\\d+)')::int <= 1
  );
```

Also catch orphan rows that never matched the catalog but were saved as obvious singles (`strip_per_pack IS NULL` and `product_type` in the drop/syrup/cream/ointment/suspension/inhaler/lotion/gel/solution family):

```sql
UPDATE medicines
SET pcs_per_strip = NULL
WHERE strip_per_pack IS NULL
  AND product_type ILIKE ANY (ARRAY[
    '%drop%','%syrup%','%suspension%','%cream%','%ointment%',
    '%gel%','%lotion%','%inhaler%','%spray%','%solution%','%shampoo%'
  ]);
```

### 2. UI defensive fallback in `CreateSale.tsx` search row + cart row

Tighten the STK label so even a row with stale `pcs_per_strip` but no `strip_per_pack` and a non-strip product type renders flat:

```ts
const looksSingle =
  isSingleUnit(med) ||
  (!med.strip_per_pack &&
    /drop|syrup|suspension|cream|ointment|gel|lotion|inhaler|spray|solution|shampoo/i
      .test(med.product_type ?? ""));

STK: {looksSingle
  ? `${med.stock_quantity ?? 0} Pcs`
  : totalPiecesToTriUnit(med.stock_quantity ?? 0, med.strip_per_pack, med.pcs_per_strip)}
```

Apply the same `looksSingle` check to the cart row STK label and to `Inventory.tsx` row + `ShortItems.tsx` row so the rule is uniform across all three list surfaces.

### 3. No catalog/import logic changes

`classifyCatalogPack` already handles new inserts correctly — leave it as-is.

## Files touched

- `supabase/migrations/<timestamp>_heal_single_unit_packs.sql` — new migration with the two UPDATEs above.
- `src/pages/CreateSale.tsx` — replace `isSingleUnit(med)` with `looksSingle` helper in the two STK label spots.
- `src/pages/Inventory.tsx` — same helper for the inventory row stock label.
- `src/pages/ShortItems.tsx` — same helper for the STK column.

## Verification

- After migration, re-query `medicines` for A-Phenicol Eye Drop / Ace Pediatric Drop / Alarid / Ace Syrup → `pcs_per_strip` and `strip_per_pack` are both NULL.
- `/create-sale` search shows `STK: 148 Pcs`, `STK: 14 Pcs`, `STK: 596 Pcs` — no colons.
- Strip products (Aceta Tablet, Acelock Tablet) still show `STK: B : S : P` matrix.
- Cart, Inventory list, and Short Items list mirror the same behavior.
