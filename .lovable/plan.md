## Reality check on the request

A couple of numbers don't line up with the request, so calling them out before we touch data:

- The uploaded `medicines.json` has **21,168 rows** — that's the public drug catalog, which already lives in `public.master_medicines` (also 21,168 rows). It is NOT the per-pharmacy `public.medicines` table.
- `public.medicines` only has **519 rows** across 2 pharmacies. That's stock the shops actually carry. So "update all 21,000+ rows in `medicines`" isn't a thing — there aren't 21k rows there.

The fix only makes sense in two stages:

1. Rebuild the catalog (`master_medicines`) from the JSON — single source of truth.
2. Re-sync the 519 `medicines` rows from the matching catalog row.

## Parsing rule (applied per JSON row)

Input fields used: `format`, `pack_size`, `box_size`.

- `pack_n` = leading integer in `pack_size` (e.g. "10s strip" → 10, "3 x 10" → 3, "Each sachet" → null).
- `pack_n2` = second integer in `pack_size` if present (e.g. "3 x 10" → 10).
- `box_n` = leading integer in `box_size` (e.g. "100s" → 100, "1" → 1).

Decision:


| Case                                                                                              | pcs_per_strip | strip_per_pack               |
| ------------------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| `pack_size` contains "x" (e.g. "3 x 10")                                                          | `pack_n2`     | `pack_n`                     |
| Tablet/Capsule-like format, `pack_n` ≥ 2 strip, `box_n` > `pack_n`                                | `pack_n`      | `box_n / pack_n`             |
| Tablet/Capsule, `pack_n` ≥ 2, `box_n` ≤ `pack_n`                                                  | `pack_n`      | 1                            |
| Tablet/Capsule, no usable `pack_n`, `box_n` > 1                                                   | 1             | `box_n` (flat box of pieces) |
| Injection/Vial/Ampoule, `box_n` > 1                                                               | 1             | `box_n`                      |
| Syrup / Drop / Cream / Ointment / Gel / Inhaler / Spray / Solution / Powder / Sachet / Suspension | null          | null (single unit)           |
| Anything else falling through                                                                     | null          | null                         |


This is the same rule already in `classifyCatalogPack`, extended to handle the "N x M" pack_size pattern (which is what triggered Alanil 120: pack_size "3 x 10" → strips=3, pcs=10).

## Stage 1 — Refresh catalog

Run a Node/TS script (executed in sandbox, not in the app bundle) that:

- Reads `/mnt/user-uploads/medicines.json`.
- Computes the three fields above for each row.
- Connects to Supabase using the service-role key (already a secret).
- For each row: `UPDATE public.master_medicines SET pack_size=$1, box_size=$2, format=$3, pcs_per_strip=$4, strip_per_pack=$5, unit_price=$6, company=$7, generic_name=$8, strength=$9 WHERE brand_name = $10` — matched on `brand_name` (the catalog's natural key).
- Batched in chunks of 500 via a single SQL statement per chunk using `UPDATE … FROM (VALUES …)` so the whole job is ~42 round-trips, not 21k.
- Reports: matched, unmatched (logged to `/tmp/unmatched.json`), changed.

Only `pcs_per_strip`, `strip_per_pack`, `pack_size`, `box_size`, `format` are guaranteed to be overwritten. The other columns are refreshed too because they come from the same authoritative JSON; nothing in `master_medicines` is user-edited.

## Stage 2 — Re-sync per-pharmacy stock rows

A single SQL `UPDATE` (no script needed — 519 rows):

```sql
UPDATE public.medicines m
SET pcs_per_strip  = mm.pcs_per_strip,
    strip_per_pack = mm.strip_per_pack,
    format         = COALESCE(m.format, mm.format),
    pack_size      = COALESCE(m.pack_size, mm.pack_size),
    box_size       = COALESCE(m.box_size, mm.box_size),
    strength       = COALESCE(m.strength, mm.strength),
    generic_name   = COALESCE(m.generic_name, mm.generic_name)
FROM public.master_medicines mm
WHERE lower(m.name) = lower(mm.brand_name)
  AND lower(coalesce(m.company_name,'')) = lower(coalesce(mm.company,''));
```

Explicitly NOT touched on `medicines`: `price`, `stock_quantity`, `stock_alert`, `expiry_date`, `pharmacy_id`, `product_type`, `unit_format`, `product_size`, `packaging_type`, `created_at`, `id`. So custom prices and stock counts are safe.

Rows with no catalog match (e.g. shop-created custom products) are left untouched. Their names get logged for review.

## Safety / rollback

- Before stage 1, snapshot the two affected columns to a temp table:
  ```sql
  CREATE TABLE _backup_master_pack_20260612 AS
  SELECT id, pcs_per_strip, strip_per_pack, pack_size, box_size, format FROM public.master_medicines;
  CREATE TABLE _backup_medicines_pack_20260612 AS
  SELECT id, pcs_per_strip, strip_per_pack, pack_size, box_size, format FROM public.medicines;
  ```
  Kept for 7 days, then dropped manually.
- Dry-run first: parse the JSON locally, print 20 sample rows + summary counts ("X rows would change pcs_per_strip, Y would change strip_per_pack, Z unmatched"). Show output, get confirmation, then run for real.

## What I need from you before building

1. Confirm: **catalog rewrite is OK** — `master_medicines.unit_price`, `generic_name`, `strength`, `company`, `format` will be overwritten from the JSON. (Recommended; otherwise we leave stale data.) If not, I'll restrict the catalog update to just the 5 pack-related columns.
2. Confirm: the "3 x 10" pack_size pattern means `strip_per_pack=3, pcs_per_strip=10` (your Alanil 120 example confirms this). Some catalogs use it the other way around.
3. For unmatched `medicines` rows (custom shop products), confirm we should leave them alone rather than clearing their pack fields.

Once you confirm, I'll run the dry-run, show the diff summary, then execute both stages.

&nbsp;

Excellent reality check! Your 2-stage plan and the parsing table are 100% accurate and professional. Here are the confirmations you need to proceed:

1. CONFIRMATION 1 (Catalog Rewrite): Yes, it is fully OK to overwrite the other columns (unit_price, generic_name, strength, company, format) from the JSON to make 'master_medicines' the absolute single source of truth. Let's refresh the full data cleanly.

2. CONFIRMATION 2 ("3 x 10" Pattern): Yes, I confirm that the "3 x 10" pattern means strip_per_pack = 3 (3 strips) and pcs_per_strip = 10 (10 pieces per strip). This matches our Alanil 120 structure.

3. CONFIRMATION 3 (Unmatched Rows): Yes, leave the unmatched 'medicines' rows (custom shop products) completely alone. Do not clear or touch their fields.

Your safety/rollback backup strategy is excellent. Please proceed with the dry-run now, show me the sample diff summary, and once verified, execute both stages for real!