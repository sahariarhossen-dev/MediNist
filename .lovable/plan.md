# Fix Tablet/Capsule STK regression

## Root cause

Two compounding problems:

1. **Data hole.** Several `medicines` rows (e.g. `Ace 500 mg Tablet`) currently have `pcs_per_strip = NULL` AND `strip_per_pack = NULL`, even though the matching `master_medicines` row has `box_size = "100s"` and `pack_size = "10s strip"`. With both pack fields null, `getPackMode` returns `"single"` → `isSingleUnit` returns true → `looksSingleUnit` returns true → label renders as `STK: 140 Pcs`.

2. **Helper has no hard guard for Tablet/Capsule.** `looksSingleUnit` only checks `strip_per_pack > 1`. When that field is null (data hole above), nothing prevents a Tablet from collapsing to "single". The user's rule is explicit: a `Tablet` / `Capsule` must NEVER render as a single flat count.

The previous syrup/drop regex is correct and is not the problem — it does not match the word "Tablet".

## Fix

### 1. Data heal migration (re-derive strip data from master catalog)

New migration that, for every `medicines` row where BOTH `pcs_per_strip` and `strip_per_pack` are NULL, finds the matching `master_medicines` (by `brand_name` + `company` + `format`) and back-fills using the same rule as `classifyCatalogPack`:

```sql
WITH parsed AS (
  SELECT
    m.id,
    NULLIF(substring(mm.box_size  from '(\d+)'), '')::int AS box_n,
    NULLIF(substring(mm.pack_size from '(\d+)'), '')::int AS pack_n
  FROM medicines m
  JOIN master_medicines mm
    ON lower(m.name) = lower(mm.brand_name)
   AND lower(coalesce(m.company_name,'')) = lower(coalesce(mm.company,''))
   AND lower(coalesce(m.product_type,'')) = lower(coalesce(mm.format,''))
  WHERE m.pcs_per_strip IS NULL
    AND m.strip_per_pack IS NULL
)
UPDATE medicines m
SET pcs_per_strip = parsed.pack_n,
    strip_per_pack = CASE
      WHEN parsed.box_n > 1 AND parsed.pack_n > 1 AND (parsed.box_n / parsed.pack_n) > 1
        THEN parsed.box_n / parsed.pack_n
      ELSE NULL
    END
FROM parsed
WHERE m.id = parsed.id
  AND parsed.box_n > 1
  AND parsed.pack_n > 1
  AND (parsed.box_n / parsed.pack_n) > 1;
```

This restores `Ace 500 mg Tablet` to `pcs_per_strip = 10`, `strip_per_pack = 10` → `140` pcs renders as `1 : 4 : 0`. Drops/Syrups/Suspensions stay null (their `box_n <= 1`), so they keep showing flat `Pcs`.

### 2. Harden `looksSingleUnit` in `src/lib/stockUtils.ts`

Add a hard Tablet/Capsule guard before any regex matching:

```ts
const STRIP_TYPE_RE = /^(tablet|capsule)s?$/i;

export const looksSingleUnit = (med) => {
  // Hard rule: Tablet / Capsule are NEVER single-unit at the UI layer,
  // even if their pack fields got nulled out by stale data.
  const typeRaw = (med?.product_type ?? med?.format ?? "").trim();
  if (STRIP_TYPE_RE.test(typeRaw)) return false;

  if (isSingleUnit(med)) return true;
  const spp = Number(med?.strip_per_pack ?? 0);
  if (spp > 1) return false;

  // Only the explicit single-unit formats opt into flat Pcs display
  const formatStr = `${med?.product_type ?? ""} ${med?.unit_format ?? ""} ${med?.format ?? ""}`;
  return SINGLE_UNIT_TYPE_RE.test(formatStr);
};
```

Key tightening:
- Tablet/Capsule short-circuit returns `false` before anything else runs.
- The regex test is unchanged (`drop|syrup|suspension|cream|ointment|gel|lotion|inhaler|spray|solution|shampoo`) — it never matched "Tablet"/"Capsule", but moving it after the hard guard makes the intent explicit.

### 3. No changes needed in `CreateSale.tsx`, `Inventory.tsx`, `ShortItems.tsx`

All three already call `looksSingleUnit(med)`. Fixing the helper + restoring the data is enough.

## Verification

After applying:
- `Ace 500 mg Tablet` (stock 140, pps 10, spp 10) → `STK: 1 : 4 : 0`
- `Ace Duo Tablet` (already populated) → `STK: 2 : 0 : 0`
- `A-Phenicol Eye Drop` (stock 48, both null, type "Eye Drop") → `STK: 48 Pcs`
- `Ace Pediatric Drop` (stock 148) → `STK: 148 Pcs`
- `Ace Syrup` (stock 596) → `STK: 596 Pcs`
- `Ace Suppository` (stock 49, type "Suppository") → falls through to matrix `0 : 0 : 49`. If user wants Suppositories flat too, we can add `suppository` to the regex — flag during build.

Same labels appear in `/create-sale` search, cart row, `/inventory`, and `/short-items`.

## Files touched

- `supabase/migrations/<new>_reheal_tablet_capsule_packs.sql` — back-fill migration above.
- `src/lib/stockUtils.ts` — add Tablet/Capsule hard guard at the top of `looksSingleUnit`.

No other UI files need edits.
