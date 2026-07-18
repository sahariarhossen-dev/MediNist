
# MediNist Master Database — Audit & Master Cleanup Strategy

No code will be written. This is the report + strategy you asked for. Numbers below are pulled live from `master_medicines` and `spider_sync_progress`.

---

## 1. What the cron job was actually built to do

The `spider-catalog-sync` edge function (invoked on a schedule with `?auto=1`) is a **cross-verifier**, not an importer. For each row in `master_medicines` it:

1. Searches medex.com.bd for the brand.
2. Filters candidate brand URLs by a normalized "core token" of the brand name.
3. Opens the brand page and parses: brand title, generic, strength, company, unit price, strip price, pack text, pcs/strip, strips/pack, and container info for liquids/creams/injections.
4. Runs three gates: **brand match → generic subset match → strength match**, then a **math sanity check** (`unit × pcs_per_strip ≈ strip_price`, `strip × strips_per_pack ≈ pack_total`).
5. On pass: overwrites our `unit_price`, `pcs_per_strip`, `strip_per_pack`, `pack_size` (and `generic_name` if empty) and stamps `medex_status = matched`. On fail: stamps the specific failure reason.
6. Persists progress in `spider_sync_progress` so it can resume across invocations.

Objective in one line: **use MedEx as ground truth to correct the corrupted price/pack/strength fields we imported from the original spider, one batch at a time, safely.**

---

## 2. What the run actually found

Sync is **finished**: 21,168 / 21,168 rows scanned.

| medex_status | Count | % |
|---|---:|---:|
| matched | 13,446 | 63.5% |
| unmatched_strength_mismatch | 4,369 | 20.6% |
| unmatched_no_candidate | 2,558 | 12.1% |
| unmatched_generic_mismatch | 494 | 2.3% |
| NULL (never scanned) | 284 | 1.3% |
| math_mismatch | 17 | 0.1% |

So the **real corruption rate is ~36.5%**, dominated by three patterns:

### Pattern A — Strength-format drift (~20.6%)
Our DB stores concentration-per-volume as bare numerator (`125 mg`), MedEx writes the full expression (`125 mg/5 ml`, `(5 mg+6.25 mg)/5 ml`, `1 gm/vial`, `2% w/w`, `0.5 mg/0.5 ml`). Even after the "relaxed" comparator, composite/percent/per-dose forms still fail. Live samples confirm this: Intracef 125 mg vs `125 mg/5 ml`, Phenergan Plus, Piroban Ointment 2% w/w, Semaglutide 0.5 mg/0.5 ml, Ceftriaxone 1 gm/vial.

### Pattern B — Brand not discoverable (~12.1%)
MedEx doesn't index the brand at all (herbal/Unani lines like Hamdard's Rooh Afza, Rowghan Surkh, Saduri, Vitorist), OR our brand string has decorators MedEx doesn't ("Syrup", "Injection", "Ointment" inside the brand name), OR the same brand has multiple SKUs (drop vs tube for Moxigen) and only one variant slug matches our core token.

### Pattern C — Generic mismatch (~2.3%)
Legitimate: our generic was wrong or MedEx lists a combination differently (e.g. reversed order, "+" vs " and "). Sometimes our field is a formulation note instead of a real INN.

### Pattern D — Math mismatch (~0.1%)
Nearly zero. Not a systemic problem.

### Pattern E — Never scanned (~1.3%)
284 rows with `medex_status = NULL` — rows inserted after the spider passed their offset, or skipped by dedupe.

---

## 3. What went wrong in the previous parsing/import logic

The original 21k import (pre-cross-verification) had four structural bugs the audit exposes:

1. **`pack_size` was overloaded.** A single free-text field held everything from `"5 x 10"` (strip×pcs) to `"100ml bottle"` to `"1 vial"` to `"10's pack"`. Downstream code that divided `box_size / pack_size` produced nonsense for non-strip formats. Fixed structurally later via `parseNxMPack` + `classifyCatalogPack`, but the *stored data* was never re-normalized.
2. **Strength was truncated during scrape.** The old parser grabbed the first `\d+\s*(mg|ml|%)` token and dropped the denominator/percent-suffix/multi-component tail. That's exactly what makes Pattern A so large today.
3. **Product-type classification was inferred from strings, not enforced.** "Injection", "Cream", "Drops" living inside `brand_name` fooled a strip-oriented pipeline into computing per-unit prices for containers, corrupting MRP.
4. **No idempotent identity.** Rows are matched by `(lower(name), lower(company))` only. Same brand with two SKUs (Moxigen drop vs tube) collides — one wins, the other gets wrong pack/price. No `(brand, company, strength, pack_size)` uniqueness.

Result: the 45% mismatch you observed downstream was the compounded effect of #1–#4 hitting the same rows across MRP, box size, and product type.

---

## 4. Bulletproof cleanup strategy (phased, no code yet)

Goal: drive `matched` to ≥ 99% and make every remaining row *explicitly* accounted for (verified-manual, discontinued, or non-MedEx). No blind overwrites, no scraper bans.

### Phase 0 — Freeze & snapshot (safety net)
- Snapshot `master_medicines` and `medicines` into `_backup_master_20260718` / `_backup_medicines_20260718` tables (we've done this before, do it again before any bulk write).
- Add a `medex_confidence` column (`high | medium | low | manual | none`) alongside `medex_status`, so we track *why* a row is trusted, not just whether it matched once.
- Add a `medex_last_attempt_at` + `medex_attempts` counter to prevent hammering the same failing URL forever.

### Phase 1 — Fix the strength comparator (kills ~90% of Pattern A on paper)
Rewrite `strengthMatches` around a **canonical strength object**, not string tricks:
- Parse both sides into `{ components: [{ value, unit }], denominator: { value, unit } | null, percent: number | null, iu: number | null }`.
- Match if component multisets are equal *and* denominators are compatible (either both null, both equal, or ours is null and MedEx has one — treat that as "we were incomplete, accept and upgrade").
- Special-case `%`, `IU`, `w/w`, `w/v`, `pre-filled syringe`, and `/vial|/puff|/spray|/dose|/drop|/application`.
- On acceptance where ours was incomplete, **upgrade our strength field** to MedEx's canonical string — this is the actual data-quality win.

Expected impact: recovers ~3,500–4,000 of the 4,369 strength mismatches.

### Phase 2 — Candidate discovery v2 (kills most of Pattern B)
- Strip formulation suffixes (`Syrup`, `Injection`, `Ointment`, `Drop`, `Cream`, `Gel`, `Inhaler`, `Suspension`) from the brand before core-tokenizing.
- Query MedEx with `brand + company` and `brand + generic` as fallbacks — not just brand + strength.
- Rank returned URLs by (a) slug-core prefix, (b) company match on the brand page, (c) pack-format compatibility with our row's format. Pick the best, not the first.
- When multiple SKUs of the same brand exist (Moxigen drop vs tube), disambiguate on **container/format**, not on strength alone.
- Whitelist non-MedEx brands (Hamdard Unani, herbal, imported OTC) into a `non_medex_catalog` allowlist so they stop being retried and get `medex_status = 'out_of_scope'`.

Expected impact: recovers ~1,500 of the 2,558 no-candidate rows; the rest get cleanly classified as out-of-scope.

### Phase 3 — Structural schema fixes (prevents Pattern D and future regressions)
- Add a real `product_type` enum column (`strip | liquid | semisolid | single_unit | herbal`) populated from MedEx `format` on match, and never inferred from strings again.
- Add a partial unique index `(lower(brand_name), lower(company), lower(coalesce(strength,'')), lower(coalesce(pack_size,'')))` **after** a one-off dedupe migration; log dupes to a review table instead of dropping them.
- Split `pack_size` into typed columns already present (`pcs_per_strip`, `strip_per_pack`, `container_qty`, `container_unit`) as the source of truth; keep `pack_size` as a *derived* display string only.

### Phase 4 — Controlled re-verification pass (no bans)
- Re-run the cron **only on rows with `medex_status IN ('unmatched_strength_mismatch','unmatched_generic_mismatch','unmatched_no_candidate', NULL)`** — ~7,700 rows, not 21k.
- Rate profile: `limit=10`, `delay=3000–4000ms`, one batch per 5 min via `pg_cron` (already wired). That's ~120 rows/hour, ~2,900/day, so the retry pass finishes in ~3 days with zero risk of MedEx blocking.
- Rotate User-Agent per request from a small pool; back off exponentially on HTTP 429/503; if 3 consecutive failures, pause the job for 30 min. All of this is edge-function-side, no new infra.
- Every write goes through a diff-check: if the incoming value would *change* an already-`matched` row by > 20% on price or change `product_type`, quarantine to `medex_review_queue` instead of overwriting.

### Phase 5 — Human review lane for the tail
- After Phase 4, whatever remains unmatched goes into a lightweight **`medex_review_queue`** table with the parsed candidate URL + parsed page fields side-by-side with our row.
- A tiny internal-only admin screen (later, not now) lets you approve/reject in one click. Approvals stamp `medex_confidence = 'manual'` and become permanent ground truth.

### Phase 6 — Guardrails so we never regress
- Every future insert into `master_medicines` starts life as `medex_status = 'pending'` and enters the cron queue automatically.
- Nightly job: sample 200 random `matched` rows, re-verify against MedEx, alert if drift > 1%.
- Weekly job: report % matched / avg confidence / count of `review_queue` so we can watch quality trend, not guess.

---

## Target end state

| Metric | Now | After Phase 4 | After Phase 5 |
|---|---:|---:|---:|
| matched (auto) | 63.5% | ~92% | ~92% |
| out_of_scope (whitelisted) | 0% | ~5% | ~5% |
| manual (human-approved) | 0% | 0% | ~3% |
| unclassified | 36.5% | ~3% | **0%** |

That gets you to "every row is either machine-verified, human-verified, or explicitly out of scope" — which is the operational definition of a bulletproof master DB.

---

## Approval gate

If you approve this plan, the natural execution order is: Phase 0 → 1 → 2 → 3 → 4 → 5 → 6, with a checkpoint after Phase 1 (I'll show you the recovery numbers before touching Phase 2). Nothing gets written to `master_medicines` outside a snapshot until you say go.

Reply "approve" (or edit any phase) and I'll switch to build mode and start with Phase 0 + Phase 1.
