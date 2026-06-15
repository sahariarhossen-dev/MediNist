## Goal

Loosen strength comparison and search fallback in `supabase/functions/spider-catalog-sync/index.ts` so the ~20 currently failing liquid/injection/inhaler/topical rows match on the next sweep.

## Changes (all in `supabase/functions/spider-catalog-sync/index.ts`)

### 1. New helper: `stripDenominators(s)`
Removes trailing per-unit designators before normalization:
- `/5 ml`, `/5ml`, `/10 ml`, `/ml`, `/vial`, `/puff`, `/spray`, `/drop`, `/dose`, `/g`, `/gm`, `/application`
- Case-insensitive regex; also strips surrounding parentheses.

### 2. New helper: `strengthNumbers(s)`
Extracts every numeric token (incl. decimals) from a strength string into a sorted array, e.g. `(5 mg+2 mg+2 mg+20 mg)/5 ml` → `[2,2,5,20]` (ignoring the `5` denominator by first calling `stripDenominators`).

### 3. New comparator: `strengthMatches(dbStrength, pageStrength)`
Returns true if ANY of:
- a. `norm(stripDenominators(db)) === norm(stripDenominators(page))` — handles `125 mg/5 ml` ↔ `125 mg`.
- b. Composite multiset match: `strengthNumbers(db)` is a subset of `strengthNumbers(page)` AND every db number appears verbatim in the page strength text (regex `\b<num>\b`). Handles `(5 mg+2 mg+2 mg+20 mg)/5 ml` ↔ page text containing `5 mg + 2 mg + 2 mg + 20 mg`.
- c. Units-only fallback: when db has only a percentage (`0.1%`) or IU and page contains the same token.

Replace the line `if (!page.strength_text || norm(page.strength_text) !== wantStrength)` with `if (!page.strength_text || !strengthMatches(row.strength, page.strength_text))`.

### 4. Search fallback for `unmatched_no_candidate`
Extend `discoverCandidates` query order to:
1. `brand + full strength`
2. `brand + first-number-only strength` (e.g. `A-Cal D 500 mg` instead of `500 mg+200 IU`)
3. `brand` only (already there)
4. `brandCoreToken(brand)` (last resort, strips suffix like " Tablet"/" Syrup")

This auto-recovers `0.1%`, `500 mg+200 IU`, `500 mg+65 mg`, pediatric drops, etc.

### 5. Outcome bookkeeping
No schema changes. Same `Outcome` enum. After deploy, rows that previously failed will simply flip to `matched` on next cron tick; failure reasons remain accurate for the genuinely unmatched.

## Out of scope
- No DB migration.
- No changes to Step C/D pack-parsing math (already non-strip safe).
- No retroactive re-run script — the existing cron sweep will pick these rows up because `medex_status != 'matched'` rows are re-queried.

## Deploy
Deploy `spider-catalog-sync` immediately after the edit. Monitor `spider_sync_progress.matched_total` to confirm the formerly-failing rows convert.
