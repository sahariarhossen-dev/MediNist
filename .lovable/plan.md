## Plan: definitive MedEx pack-size repair

### What I found
- `A-Meb Tablet` in the live database is still wrong: `pack_size = "10s strip"`, `box_size = "100s"`, `strip_per_pack = 10`, `pcs_per_strip = 10`.
- The previous NxM backfill could not fix A-Meb because its saved `pack_size` text no longer contains MedEx’s real `(5 x 10)` value.
- Fresh add flows currently recompute from `pack_size + box_size`; when `pack_size` is stale (`10s strip`), the app derives `100 / 10 = 10 strips`, so the wrong value keeps coming back.

### Fix approach
1. **Restore authoritative MedEx package text in `master_medicines`**
   - Add a guarded Edge Function routine to rescrape MedEx brand pages for every master row in chunks.
   - For each matched page, parse the visible package text like `(5 x 10: ৳ 300.50)`.
   - Force-overwrite `pack_size`, `unit_price`, `strip_per_pack`, and `pcs_per_strip` in `master_medicines` from the page result.
   - For NxM, first number always becomes `strip_per_pack`; second number always becomes `pcs_per_strip`.

2. **Force-sync every pharmacy inventory row**
   - After each corrected master row, update matching rows in `medicines` by normalized name/company/strength.
   - Overwrite `pack_size`, `price`, `strip_per_pack`, and `pcs_per_strip`; do not preserve legacy calculated values.
   - This repairs already-added tenant medicines such as the existing A-Meb row.

3. **Immediate A-Meb repair**
   - Run a direct data update for `A-Meb Tablet` now using MedEx’s verified values:
     - `pack_size = "5 x 10: ৳ 300.50"`
     - `unit_price / price = 6.01`
     - `strip_per_pack = 5`
     - `pcs_per_strip = 10`
   - Apply it to both `master_medicines` and matching `medicines` rows so the user sees the fix instantly.

4. **Harden add/edit retrieval**
   - Update catalog add flows in `CatalogSearch.tsx` and `Inventory.tsx` to prefer database columns `pcs_per_strip` and `strip_per_pack` when present.
   - Only fall back to parsing `pack_size + box_size` if the DB columns are missing.
   - Include `pack_size`, `box_size`, `generic_name`, `strength`, and `format` when inserting into local `medicines`, so future edit pages have full source context.

5. **Edit-page self-healing**
   - When opening Edit Product, fetch the matching master row by name/company/strength.
   - If the master has corrected pack numbers, populate the form from those values instead of stale local values.
   - On save, preserve those corrected values.

6. **Verification queries**
   - Confirm A-Meb in `master_medicines` is `5 / 10`.
   - Confirm A-Meb in `medicines` is `5 / 10`.
   - Confirm catalog search/add payload uses the corrected columns and no longer derives `10` from stale `100s / 10s` data.

### Technical details
- Data changes will use the Supabase data-change tool, not a schema migration.
- Edge Function code can be updated afterward for ongoing batch repair/resync, using the existing `spider-catalog-sync` function and `CRON_SECRET` guard.
- No manual shopkeeper edits will be required.