# Master Medicine Dataset Import (Staging First)

## What the uploaded file actually contains

I parsed `Master_database-2.json` read-only and audited it:

- **21,168 rows total**, spread across **83 separate JSON arrays concatenated in one file** (so it is not a single valid JSON document — the loader must decode it block by block, otherwise the import silently fails).
- **Every row has exactly the same 8 keys**: `brand_name`, `generic_name`, `strength`, `unit_price`, `company`, `format`, `pack_size`, `box_size`. No key drift anywhere — this is what caused scrambling before and it is clean now.
- **0 rows missing a brand name.**
- **0 non-numeric prices** (all values are proper JSON numbers).
- **18 rows priced at 0 or below.**
- **616 duplicate rows** on brand + strength + company + pack size.
- The file has **no `pcs_per_strip` / `strip_per_pack`** columns — these must be derived from `pack_size` / `box_size`.
- For reference, the live `master_medicines` table currently holds **26,263 rows**, so this import will reduce the catalog to 21,168 clean rows.

## Column mapping

| File key | `master_medicines_import` column | Notes |
|---|---|---|
| brand_name | brand_name | trimmed, required |
| generic_name | generic_name | `"N/A"` stored as NULL |
| strength | strength | `"N/A"` stored as NULL |
| unit_price | unit_price | numeric; 0/negative kept but reported |
| company | company | trimmed |
| format | format | e.g. Tablet, Capsule, Injection, Syrup |
| pack_size | pack_size | e.g. `10s strip`, `1 vial`, `100ml bottle` |
| box_size | box_size | e.g. `100s`, `30s`, `1` |
| *(derived)* | pcs_per_strip | from `pack_size`: `10s strip` -> 10; liquid/vial/tube formats -> 1 |
| *(derived)* | strip_per_pack | `box_size / pcs_per_strip` when both are unit counts, else 1 |

Derivation rules for the two computed columns:
- `pack_size` matching `<n>s strip|s pack|s tab` -> `pcs_per_strip = n`.
- Liquid / single-unit formats (ml, gm, vial, ampoule, tube, drop, sachet, inhaler) -> `pcs_per_strip = 1`, `strip_per_pack = 1`.
- `box_size` matching `<n>s` and divisible by `pcs_per_strip` -> `strip_per_pack = n / pcs_per_strip`, otherwise 1.

## Step 1 — Load staging (Migration A)

- Truncate `public.master_medicines_import` (it is an untouched, RLS-locked staging table — nothing in the app reads it).
- Insert all 21,168 mapped rows in batches, inside one transaction.
- The live `master_medicines` table is **not touched** in this step.

## Step 2 — Audit and sample

After the load I will run and report:
- Row count in staging vs 21,168 expected.
- Rows with empty/NULL brand name.
- Rows with NULL, zero, or negative price.
- Duplicate count on brand + strength + company + pack size.
- Distribution of derived `pcs_per_strip` / `strip_per_pack` to confirm liquids got 1/1 and strips got real counts.
- A formatted 15-row sample table in chat: `Brand | Generic | Strength | Unit Price | Company | Format | Pack/Box`, deliberately mixing Tablet, Capsule, Injection, Syrup, Drop and Cream rows so column alignment is visually verifiable across formats.

Then I stop and wait for your explicit approval.

## Step 3 — Final cutover (Migration B, only after your green light)

Single transaction:
1. `TRUNCATE public.master_medicines` (wipes all 26,263 old rows).
2. `INSERT INTO public.master_medicines (...) SELECT ... FROM public.master_medicines_import`.
3. Rebuild `search_vector` for every row and reindex the GIN/trigram search indexes.
4. `DROP TABLE public.master_medicines_import`.

Nothing outside the catalog is affected: `medicines` (per-pharmacy stock), sales, and inventory rows are separate tables and are not referenced by `master_medicines` foreign keys.

## Open decisions before I load staging

1. **Duplicates (616):** drop them during staging load, or keep every row exactly as uploaded?
2. **Zero/negative prices (18 rows):** import as-is, store as NULL, or skip those rows?

Tell me how you want these two handled (or say "as-is") and I will run steps 1 through 4.
