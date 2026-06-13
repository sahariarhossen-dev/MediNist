# Spider.cloud catalog sync — confirmed rules + execution

## Confirmed decisions
1. **Price column** = per-piece **Unit Price** scraped from MedEx (saved into `master_medicines.unit_price`).
2. **Pharmacy `medicines.price`** = **NOT overwritten**. Custom shop prices are protected. We only refresh `pcs_per_strip` / `strip_per_pack` on the pharmacy rows.
3. **Search query** includes `strength` when present (e.g. "Napa 500 mg") so MedEx returns the exact variant, not a fuzzy first match.

## API key
You pasted `sk-0315549c-c9c1-4d4e-87cf-c4dc23279af6`. The project already has `SPIDER_API_KEY` in secrets — I'll rotate it to this value via `update_secret` so the edge function picks it up automatically. No code change needed for the key itself.

## Code changes to `spider-catalog-sync/index.ts`
1. **Search URL** — build as `https://medex.com.bd/search?search=<brand> <strength>` (URL-encoded, strength appended only when not null/empty). Brand-only fallback if the strength-qualified search returns zero hits.
2. **Pharmacy update** — drop `price` from the `medicines` update payload. Only `pcs_per_strip` and `strip_per_pack` get written there.
3. Keep the existing parser (Unit Price + pack-size-info), Spider `/crawl` call, 1 req/sec pacing, dry-run flag, snapshot tables.

## Execution sequence (build mode)
1. **Backup** — `CREATE TABLE _backup_spider_full_<ts> AS SELECT … FROM master_medicines` and the same for pharmacy `medicines` rows that will be touched. Done via migration before any write.
2. **Rotate** `SPIDER_API_KEY` secret to the new value.
3. **Deploy** updated `spider-catalog-sync`.
4. **Dry-run batch of 20** — `POST /spider-catalog-sync?limit=20&dry=1`. I paste the full diff table here (brand · strength · before pack/price · scraped pack/price · scraped MedEx URL · status).
5. **Halt for your eyeball** — if even one row looks wrong, we stop and tune the parser. Otherwise:
6. **Full write** — process all ~21,168 master rows in chunks of 200 with `dry=0`, offset stepping. Each chunk returns counts + samples; I report progress every 5 chunks. At 1 req/sec + 2 Spider calls per row (search + brand page) this is ~12 hours of wall time, so I'll run it in the background via a loop and surface a final summary.
7. **Final report** — total updated, unmatched list (CSV at `/mnt/documents/spider_unmatched.csv`), and per-pharmacy `medicines` rows refreshed.

## Safety net
- All snapshots stay until you tell me to drop them (`DROP TABLE _backup_spider_full_<ts>`).
- Unmatched rows (no MedEx hit) are logged, not touched.
- Pharmacy stock, expiry, custom prices: untouched.

Ready to switch to build mode and run.
