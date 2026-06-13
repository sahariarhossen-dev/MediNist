## Heads-up on the API key

You pasted the placeholder `[আপনার_API_Key_এখানে_বসান]`, not a real key. No problem — `SPIDER_API_KEY` is already configured in this project's secrets (see Supabase secrets list), so the edge function can read it directly via `Deno.env.get('SPIDER_API_KEY')`. If that stored key is stale, rotate it via Project Settings → Secrets before we run; otherwise we'll use what's already there.

## Scope of this run

A **test batch of 20 medicines only** from `master_medicines`, ordered by `brand_name`. No bulk run until you confirm the 20-row results look correct. Nothing else in the DB is touched.

## What gets scraped per medicine

For each of the 20 rows we:

1. Build a MedEx URL. Preferred: the cached URL in `public.medex_cache` if present (keyed by brand). Fallback: `https://medex.com.bd/search?search=<brand_name>` → follow first `/brands/...` result.
2. POST to Spider.cloud `/crawl` with `{ url, limit: 1, return_format: "html", request: "smart" }` and `Authorization: Bearer ${SPIDER_API_KEY}`.
3. Parse the returned HTML with `deno-dom` and extract:
   - **Pack text** — the "Pack Size" / "Unit Price" row on MedEx brand pages (e.g. "10 x 10: ৳ 12.00", "3 x 10's pack: ৳ 360.00", "Each 5 ml: ৳ 50.00").
   - **MRP** — the "Unit Price" or "Pack Price" Taka value on the same row. We prefer **pack price** when both are shown, because that's what the shop actually charges per strip/box; fall back to unit price × pack count when only unit is shown.

## Derivation rules (same as before, applied to scraped text, not DB text)

Input: the literal pack string scraped from MedEx.

| Pattern                            | pcs_per_strip | strip_per_pack |
| ---------------------------------- | ------------- | -------------- |
| `N x M` (e.g. "3 x 10")            | M             | N              |
| `Ns pack` / `N's pack` (tablet)    | N             | 1              |
| Bottle / Tube / Inhaler / Sachet   | null          | null           |
| Vial / Ampoule `N`s box            | 1             | N              |

MRP parsing: regex `৳\s*([\d,]+(?:\.\d+)?)`, take the **last** match on the pack row (that's the pack/unit price column). Store as numeric, rounded to 2 dp.

## What gets written

Per matched row, **overwrite**:

- `master_medicines.pcs_per_strip`, `strip_per_pack`, `unit_price`, and `pack_size` (set to the scraped pack text so the source-of-truth is updated).
- `medicines.pcs_per_strip`, `strip_per_pack`, `price` — only for the 519 pharmacy rows whose `(name, company_name)` matches one of the 20 scraped brands. Custom shop products stay untouched.

NOT touched on `medicines`: `stock_quantity`, `stock_alert`, `expiry_date`, `pharmacy_id`, `product_type`, `unit_format`, `product_size`, `packaging_type`. So shop stock and custom settings are safe.

## Safety

- Snapshot the affected 20 master rows + matching pharmacy rows into `_backup_spider_test_<timestamp>` before any write.
- Dry-run mode (`?dry=1`) returns a JSON diff of `before → after` for all 20 without writing. We'll run dry-run first, you eyeball it, then we flip to write mode.
- Spider.cloud calls are rate-limited to 1/sec with a 30 s timeout each, so a 20-row batch finishes in well under a minute.

## Deliverables

1. New edge function `supabase/functions/spider-catalog-sync/index.ts`:
   - Auth: `x-cron-secret` header must equal `CRON_SECRET`.
   - Params: `limit` (default 20), `dry` (default `1`), `offset` (default 0).
   - Response: `{ scraped, matched, updated_master, updated_medicines, samples: [...], unmatched: [...] }`.
2. Invocation flow:
   - **Step A** — dry-run on first 20, return diff samples for your review.
   - **Step B** — after your OK, re-invoke with `dry=0` to actually write.
3. Function is left deployed (not deleted) so we can re-run for the next batch (`offset=20&limit=20`, etc.) after the test passes.

## Open questions before I build

1. **Pack vs unit price**: confirm we should save the **pack price** (what one strip/box costs at retail) into `unit_price`, not the per-piece price. Your current data mixes both — this is the moment to pin it down.
2. **Pharmacy `medicines.price`**: some shops may have set custom prices. Confirm it's OK to overwrite those with the scraped MRP for the test 20. (If not, we'll skip the pharmacy-side price update and only refresh `master_medicines.unit_price`.)
3. **No-match behaviour**: if MedEx search returns zero results for a brand (typo, discontinued), log it to the response `unmatched` array and leave that row alone — confirm.

Once you confirm those three, I'll build the function, run the dry-run on the first 20, and paste the diff back here for your review before writing anything.