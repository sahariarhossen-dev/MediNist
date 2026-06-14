## Backend sync state

- `spider-catalog-sync-tick` is scheduled and active every 2 minutes.
- It is currently a no-op because `spider_sync_progress.next_offset = 21168`, `total_rows = 21168`, and `finished_at` is set.
- The sync is not actively re-scraping rows right now.
- Clonipres/Diatrol are wrong because the scraper can match the right brand but the wrong strength variant, then writes that variant's pack numbers back into the row.

## Implementation plan

### 1. Harden MedEx brand-page matching by strength

Update `supabase/functions/spider-catalog-sync/index.ts` so every scraped result must pass both checks before writing pack data:

- Brand check: URL/title/result brand must still match the requested `brand_name`.
- Strength check: parsed MedEx strength must match the requested `master_medicines.strength` after normalization.

Normalization rules:

- Case-insensitive.
- Normalize spaces and punctuation.
- Normalize units like `mg`, `mcg`, `ml`, `%`.
- Treat equivalent formatting as equal: `0.1mg`, `0.1 mg`, `0.10 mg`.
- If a master row has a non-empty strength and the MedEx page strength is missing or different, mark the row unmatched instead of updating it.

### 2. Prevent wrong-strength overwrite during local edit self-healing

Update `src/pages/AddProduct.tsx` edit-mode self-healing so it does not fetch pack numbers by brand/company alone.

It will require:

- Matching `brand_name` / `company`.
- Matching exact normalized `strength` when the local product has strength.
- If no exact strength match exists, do not overwrite the local product's `stripPerBox` / `pcsPerStrip`.

This prevents a stale or different strength variant from silently replacing the current inventory row.

### 3. Repair current Clonipres and Diatrol rows directly

Apply targeted data updates for both master catalog and pharmacy inventory rows:

- `Clonipres` with strength `0.1 mg`: `strip_per_pack = 6`, `pcs_per_strip = 10`, and matching `pack_size = '6 x 10'` price text where available.
- `Diatrol` with strength `80 mg`: `strip_per_pack = 10`, `pcs_per_strip = 10`, and matching `pack_size = '10 x 10'` price text where available.

Before updating, inspect the exact affected rows to avoid changing other strengths.

### 4. Reset sync progress for a full strict re-scrape

After the strict matching code is in place:

- Set `spider_sync_progress.next_offset = 0`.
- Set `finished_at = NULL`.
- Reset `matched_total` / `unmatched_total` counters if needed so progress reflects the new sweep clearly.
- Keep `total_rows = 21168` unless a fresh count differs.

### 5. Start the sweep immediately

Trigger `spider-catalog-sync?auto=1&dry=0&limit=50&delay=1500` once manually after reset.

Then the existing `spider-catalog-sync-tick` cron will continue every 2 minutes until the sweep reaches `total_rows` again.

### 6. Verification

Verify and report:

- Active cron job still exists.
- `spider_sync_progress` restarted from offset 0 and begins advancing.
- Clonipres 0.1 mg now shows `6 x 10` in both `master_medicines` and matching `medicines` rows.
- Diatrol 80 mg now shows `10 x 10` in both `master_medicines` and matching `medicines` rows.
- Wrong-strength variants are skipped/unmatched instead of overwriting pack data.

## Expected result

The root cause changes from “brand-only matching can poison pack data” to “only exact brand + strength matches may update pack data.” The full sweep can safely run for 10–15 hours without mixing strength variants again.