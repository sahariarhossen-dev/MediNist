# Stratified 60-row dry-run, then full write

## Stratified dry-run
Invoke the existing `spider-catalog-sync` function three times with `dry=1`, `limit=20`, `delay=500`:
1. `offset=0` (alphabetical head)
2. `offset=10000` (middle of catalog)
3. `offset=20000` (tail)

Aggregate match rates per zone, plus a per-zone diff table (brand · before pack/price · after pack/price · MedEx URL · status). Spot-check a couple of well-known brands (e.g. Napa, Seclo) against medex.com.bd in the browser fetch to confirm the parser output matches reality.

Decision rule:
- If matched-rate in the middle and tail zones is **≥70 %** AND every spot-check is correct → auto-proceed to write.
- If lower or any spot-check is off → halt and tune (parser, slug-match strictness, or fallback search) before any write.

## Full write (only if dry-run passes)
1. Snapshot via migration: `_backup_spider_full_<ts>` for `master_medicines` (full copy) + a copy of `medicines` rows whose `(name, company_name)` overlap the master set.
2. Background loop in the sandbox:
   - Total rows ≈ 21,168.
   - Chunk size: 50 rows per function call (delay=2000 ms → ~110 s per chunk, well inside the 150 s edge-function ceiling).
   - Between chunks: sleep 5 s.
   - Wall time estimate: ~424 chunks × 115 s ≈ 13.5 h. Runs in the background; I report progress every ~30 chunks.
3. Per chunk, the function (already correct):
   - Updates `master_medicines.pack_size`, `unit_price`, `pcs_per_strip`, `strip_per_pack` only when a slug-validated MedEx match is found.
   - Mirrors `pcs_per_strip` + `strip_per_pack` (NOT `price`) to matching pharmacy `medicines` rows.
   - Skips unmatched rows; logs them to an accumulated CSV at `/mnt/documents/spider_unmatched.csv`.
4. Final report: total matched, total unmatched, sample diffs, link to the unmatched CSV.

## Safety
- Snapshots stay until you say drop them.
- Any chunk that errors is retried once, then logged and skipped — never blocks the loop.
- Custom shop prices, stock, expiry: never touched.

Ready to switch to build mode.
