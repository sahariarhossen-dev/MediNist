
# Spider Catalog Sync — Verification & Rebuild Refactor

## Goal
Rebuild `spider-catalog-sync` so every row is verified against MedEx via slug + generic + strength + price math, then overwrite our master with MedEx values when they conflict. Fix the silent cron 401 and tune throttle to ~25 rows/min.

## 1. Edge function rewrite (`supabase/functions/spider-catalog-sync/index.ts`)

New per-row pipeline `processOne(row)`:

**Step A — Candidate discovery**
- Query `https://medex.com.bd/search?search=<brand + strength>`; if zero brand links, retry with brand only.
- Collect all `/brands/<id>/<slug>` links whose slug starts with `brandCoreToken(brand_name)`. If none → `unmatched` (skip immediately, no retries).

**Step B — Deep page validation** (fetch each candidate page, stop at first pass)
Parse from the brand page:
- `brand_title` (top `<h1>`/title block)
- `generic_text` (link/text under brand title, e.g. "Amlodipine Besilate + Atenolol")
- `strength_text` (line right under generic, e.g. "5 mg+50 mg")
- `company_text` (e.g. "ACME Laboratories Ltd.")
- `unit_price`, `strip_price`, `pack_text` from `.package-container`

Validation rules (all normalized: lowercase, strip non-alphanum, collapse spaces):
- Brand core token must be contained in `brand_title`.
- If DB `strength` is non-empty: normalized `strength_text` must equal normalized DB `strength`. Composite strengths like `5 mg+50 mg` are compared as `5mg50mg`.
- If DB `generic_name` is non-empty: token-set of DB generic must be ⊆ token-set of page generic (handles "+" combos and ordering).
- If DB `strength` is empty (e.g. saline, ORS, cream w/o dose): skip strength check; pass purely on brand+generic.

If a candidate fails, try the next candidate. If none pass → `unmatched`.

**Step C — Price/pack math cross-check**
Parse `pack_text` formats:
- `N x M: ৳ T` → `strip_per_pack=N`, `pcs_per_strip=M`, `total=T`
- `M's pack: ৳ T` → `strip_per_pack=1`, `pcs_per_strip=M`, `total=T`
- Else, single-unit fallback (no strip/pack).

Verify with 1% tolerance:
- `unit_price * pcs_per_strip ≈ strip_price`
- `strip_price * strip_per_pack ≈ total`

If math fails → mark `math_mismatch`, store the discrepancy in `unmatched`, do NOT overwrite (prevents writing garbage when MedEx layout is weird).

**Step D — Overwrite policy (MedEx = source of truth)**
On full pass, UPDATE `master_medicines` for that row with:
- `unit_price`, `pcs_per_strip`, `strip_per_pack`, `pack_size` (raw `"N x M"` text, no parens/price)
- `generic_name` if currently null/blank (don't clobber curated values otherwise)
- new column `medex_verified_at = now()`, `medex_url = brandUrl`

Then mirror to per-pharmacy `medicines` rows by `(name, company_name)` as today.

**Outcome codes returned per row**: `matched` | `unmatched_no_candidate` | `unmatched_generic_mismatch` | `unmatched_strength_mismatch` | `math_mismatch` | `fetch_failed`. Counts incremented in `spider_sync_progress`.

**Throttling**
- Batch limit: 50 (cap retained at 100).
- `await sleep(2400)` between rows.
- 4xx/5xx on a single MedEx fetch → log and treat as `fetch_failed`, continue (never block the batch).

**Auth**
- Keep `x-cron-secret` requirement, but ALSO accept `apikey == SUPABASE_SERVICE_ROLE_KEY` as fallback so cron can authenticate with the headers pg_net already sends.

## 2. Database changes (one migration)

```sql
ALTER TABLE public.master_medicines
  ADD COLUMN IF NOT EXISTS medex_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS medex_url text,
  ADD COLUMN IF NOT EXISTS medex_status text;

-- reset progress to resweep everything under the new rules
UPDATE public.spider_sync_progress
SET next_offset = 0,
    matched_total = 0,
    unmatched_total = 0,
    finished_at = NULL,
    last_run_at = NULL
WHERE id = 1;
```

## 3. Fix the cron job (separate insert, contains secrets)

Unschedule the broken job and recreate with `x-cron-secret` header and batch=50:

```sql
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'spider-catalog-sync-auto';

SELECT cron.schedule(
  'spider-catalog-sync-auto',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://hjqcvidezzzkfipcneit.supabase.co/functions/v1/spider-catalog-sync?auto=1&dry=0&limit=50&delay=2400',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret','<CRON_SECRET>'
    )
  );
  $$
);
```

(Run via supabase--insert, not migration, because it embeds the secret.)

## 4. Verification after deploy

1. `deploy_edge_functions(["spider-catalog-sync"])`.
2. Manual curl with `x-cron-secret`: `?auto=1&dry=0&limit=50&delay=2400` — confirm 200, ~50 scanned, mix of matched/unmatched outcomes.
3. Spot-check rows: Amloten 5mg+50mg, Clonipres 0.1mg, Diatrol — `SELECT brand_name, strength, unit_price, pcs_per_strip, strip_per_pack, pack_size, medex_url FROM master_medicines WHERE …`.
4. Wait one cron tick (~2 min); confirm `spider_sync_progress.next_offset` advances without manual triggers.
5. Check edge logs for any 401 — should be none.

## What this fixes vs current state

- 401 cron loop → cron now sends `x-cron-secret` (function also accepts service key as belt-and-suspenders).
- Wrong-strength matches (Clonipres 0.1mg → 0.25mg) → strength + generic deep-page validation.
- Wrong N×M direction / silent bad math → cross-check `unit × pcs = strip`, `strip × strips = total` before writing.
- Slow drip → batch 50, 2.4s delay = ~25 rows/min sustainable.
- Stuck rows → every failure code returns immediately to next row.
- Strengthless products → bypass strength check, match on brand+generic only.

## Out of scope (separate follow-ups)
- Cleanup pass to NULL out price/pack on rows that end up `math_mismatch` or `unmatched_strength_mismatch` after the resweep finishes.
- Re-run of `admin_resync_medicines_pack_info()` after the full sweep.
- UI surfacing of `medex_status` for admin review.
