## Root cause

The MedEx pipeline is fully wired (Spider call → search → parse → brand page → inject `<medex_data>`), and `SPIDER_API_KEY` is set. Live testing against Spider for "fineron" returns 2 valid brand links, yet the edge-function log shows `medex: no brand link found for fineron` and the AI falls back to its own (incorrect) knowledge. Three concrete bugs in `supabase/functions/ai-chat/index.ts` are responsible:

1. **`extractBrandCandidates` regex / name handling.** Spider returns link text with embedded newlines:  `[\nFineron 10 mg (Tablet)\n](https://medex.com.bd/brands/33032/...)`. The current code captures the name with the leading `\n`, then `name.split(/\s|\(/)[0]` becomes `""`, so the "exact head match" path can never succeed. In some Spider payload variants the regex also fails outright, producing `candidates.length === 0` → false MISS.

2. **`fetchMedexData` matching is too strict.** When MedEx returns multiple strengths of the same brand (Fineron 10 mg + Fineron 20 mg), both are valid for the brand name "Fineron", but the code marks them ambiguous because uniqueness is required even when all candidates share the same brand head. With bug 1 the head is empty, so it falls through to `miss`.

3. **`parseBrandPage` brand extraction.** Brand pages render as `#\nFineron Tablet` (hash on its own line). The regex `/^#{1,2}\s+(.+)$/m` requires `#` followed by space then text on the same line, so it returns `null` and the whole result is downgraded to `miss` even when the page was scraped successfully.

Secondary issues:
- `pickCandidateToken` can pick a non-medicine token first when a sentence has multiple words (e.g. "Fineron er dose koto" → may pick "dose"). It should prefer the longest non-stopword and skip Banglish helper words like `dose`, `kaj`, `khawa`, `mg`, etc.
- No diagnostic log of how many candidates were extracted, making future failures hard to triage.

## Changes (single file: `supabase/functions/ai-chat/index.ts`)

### 1. `extractBrandCandidates`
- After regex match, `trim()` the captured name and collapse internal whitespace before pushing.
- Add a second-pass scanner for the alternate Spider shape `[ Name ](url)` with a leading newline already stripped, so both serialisations work.
- Log `medex: candidates extracted` with names + URLs (first 5) for debugging.

### 2. `fetchMedexData` matching strategy
Replace the current strict logic with:
- `target = normaliseBrand(userToken)`
- For each candidate compute `head = normaliseBrand(name.split(/\s|\(/)[0])` after trimming.
- **Exact head match:** all candidates whose `head === target`. If ≥1, pick the first (shortest/lowest dose, MedEx already returns them in that order). This treats "Fineron 10 mg" + "Fineron 20 mg" as a single confident hit.
- **Prefix fallback:** if no head matches, take candidates whose `normaliseBrand(name).startsWith(target)`. If exactly one → hit; if >1 → `ambiguous`.
- **Substring fallback:** else candidates whose `normaliseBrand(name).includes(target)` and `target.length ≥ 5`. Same uniqueness rule.
- Else → `ambiguous` (top 5) or `miss` (zero).

### 3. `parseBrandPage` brand extraction
Replace the single regex with a tolerant lookup:
- Strip image markdown lines first.
- Find the first `#`, `##`, or `###` heading; the brand name may be on the same line OR the immediately following non-empty line. Trim, drop trailing "Tablet"/"Capsule"/"Syrup" boilerplate, drop parenthetical strength.
- If still empty, fall back to the `<title>` analogue at the very top of the markdown (first line before the first image).
- Only return `null` if neither heading nor title yields a non-empty string AND no `Indications` section exists.

### 4. `pickCandidateToken`
- Extend `STOPWORDS` / `NON_MED_KEYWORDS` with Banglish helper tokens: `dose`, `mg`, `mgr`, `tablet`, `capsule`, `syrup`, `kaj`, `kno`, `kano`, `khawa`, `khabo`, `khabo`, `parsho`, `pasho`, `matra`, `dam`, `price`, `kivabe`, `kibhabe`.
- Prefer a token that matches `/^[A-Z][a-z]+/` (capitalised brand) first, then the longest remaining token ≥ 4 chars.

### 5. Prompt tightening (rule 21)
Currently rule 21 still allows the model to "answer from MedEx data only" but does not aggressively forbid internal knowledge when the block is missing for a non-medicine reason. Update:
- Add a hard line: *"If none of `<medex_data>`, `<medex_candidates>`, `<medex_miss>` is present and the user's message names a medicine, you MUST reply exactly: 'Verified data পাওয়া যায়নি, kindly check spelling from medicine packet.' Do NOT guess generic, indications, dosage, price, or alternatives from internal memory under any circumstance."*
- Keep existing branches (A/B/C) unchanged.

### 6. Diagnostics
Add `console.log("medex: lookup", { token, kind, candidates: n })` at the end of `fetchMedexData`, and log brand-page parse outcome with `brand` field, so future failures are visible in `supabase--edge_function_logs`.

## Out of scope

- No DB changes (cache table unchanged).
- No frontend changes.
- No new secrets.
- Caching behaviour unchanged (24h on hit only).

## Verification

After deploy, send these messages in the AI chat and confirm via edge-function logs + reply:

| Input | Expected log | Expected reply |
|---|---|---|
| `Fineron er kaj ki?` | `medex HIT for Fineron Tablet` | 6-section report citing Finerenone, CKD/T2D indications, ৳ 80.00 unit price |
| `Valmor` | `medex HIT for Valmor` | 6-section report from MedEx |
| `Valm` | `medex AMBIGUOUS` | Disambiguation question listing brands, no 6-section |
| `Xyzbrand` | `medex MISS` | "Verified data পাওয়া যায়নি…" line + footer + inventory CTA |
| `Ajker sale koto?` | no medex log | normal sales answer |
