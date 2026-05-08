## Goal

Tighten the medicine-lookup pipeline so MedEx is the sole source of truth for every medicine query, with zero internal-knowledge fallback and explicit disambiguation when the user's brand doesn't match exactly.

## Gaps vs. the new directive

| New rule | Current behaviour | Fix |
|---|---|---|
| Trigger MedEx on **every** medicine mention (even bare "Valmor?") | Only fires when a Banglish/EN intent phrase is present (`er kaj ki`, `dose koto`, …) | Broaden `detectMedicineQuery` to also fire on a single capitalised/unknown token that isn't a stopword and isn't an inventory/sales/staff keyword |
| **Exact brand match** required, else ask "Did you mean A or B?" | First brand link is silently used; no disambiguation | Search step returns up to 5 brand links + names → if none equals user's token (case-insensitive), inject a `<medex_candidates>` block listing them so the model asks the disambiguation question |
| If MedEx returns nothing → reply "Verified data not found…" | Falls back to internal pharmacological knowledge (verified-mapping list in rule 21) | Drop the internal-knowledge fallback path. When no `<medex_data>` and intent was detected, inject a `<medex_miss>` block instructing the model to output the exact "Verified data not found" line + footer + inventory CTA |
| Pricing & alternatives from **MedEx only** | Rule 21 says "popular brand names from your knowledge" for alternatives | Rewrite rule 21 section 5 to use `Same-generic alternative brands` from the `<medex_data>` block only; if empty, say "(কোনো সমজেনেরিক বিকল্প তালিকাভুক্ত নেই)" |
| Inventory CTA wording | "...available in our shop's inventory?" | Already matches — keep |

## Changes (single file: `supabase/functions/ai-chat/index.ts`)

### 1. `detectMedicineQuery` — broaden intent
- Keep existing intent regexes as a fast path.
- Add a fallback: if the message is short (≤ 6 tokens) and contains a token that (a) is ≥ 4 chars, (b) isn't in `STOPWORDS`, (c) isn't in a new `NON_MED_KEYWORDS` set (`sale`, `due`, `stock`, `customer`, `staff`, `expense`, `profit`, `cash`, `bikri`, `kharch`, etc.), treat that token as a medicine candidate.
- Still skips for clearly non-medicine numeric/sales prompts.

### 2. `fetchMedexData` — return candidates on miss
- Change return type to `{ kind: "hit"; data: MedexData } | { kind: "ambiguous"; candidates: { name: string; url: string }[] } | { kind: "miss" }`.
- After scraping the search page, parse **all** `https://medex.com.bd/brands/...` links + their visible link text (top 5).
- If exactly one candidate's name (normalised) equals the user token → scrape that brand page → `hit`.
- If the user token matches one candidate as a substring uniquely → use it.
- If multiple candidates and none is an exact match → return `ambiguous` (no brand-page scrape, saves a Spider call).
- If zero candidates → `miss`.
- Cache only `hit` results (24 h, unchanged).

### 3. New render helpers
- `renderMedexCandidatesBlock(candidates)` → `<medex_candidates>` block instructing: "Ask the user: 'Did you mean **A**, **B**, or **C**?' Do NOT proceed with sections 1–6 until they confirm."
- `renderMedexMissBlock(name)` → `<medex_miss>` block instructing: output exactly the "Verified data not found for this name. Please check the spelling from the medicine packet." line in the user's language, then the doctor footer + inventory CTA. No 6-section report.

### 4. Request handler (around line 914)
- After `detectMedicineQuery`, branch on the new union return:
  - `hit` → inject `medex_data` block (as today)
  - `ambiguous` → inject `medex_candidates` block
  - `miss` → inject `medex_miss` block

### 5. System prompt rule 21 — rewrite
- Remove the Bangladeshi brand→generic mapping list (no internal-knowledge path remains).
- New rule 21 text:
  - "Medicine intent ⇒ this prompt will contain exactly one of `<medex_data>`, `<medex_candidates>`, or `<medex_miss>`. You MUST honour whichever block is present and never use internal pharmacological knowledge."
  - `<medex_data>` → output 6-section report from those fields ONLY. Section 5 alternatives = the `Same-generic alternative brands` field verbatim (top 3); price = the `Price` field verbatim (mark "আনুমানিক" only if "(not listed…)").
  - `<medex_candidates>` → respond with the disambiguation question only, listing brands as a bulleted choice. No 6-section report. No footer yet.
  - `<medex_miss>` → respond with the "Verified data not found…" line in the user's language, then the doctor footer, then the inventory CTA.
- Keep the inventory CTA wording aligned with the user's directive: "Would you like to check if this is in our shop's inventory?" (BN: "এই ওষুধটি আমাদের দোকানের ইনভেন্টরিতে আছে কিনা চেক করব?").
- Keep rule 22 (consent-gated inventory) and the doctor footer unchanged.

## Out of scope

- No DB schema changes (cache table already exists).
- No frontend changes.
- No new secrets (`SPIDER_API_KEY` already configured).

## Verification scenarios

- **"Valmor"** alone → search returns Valmor + Valmore → exact match Valmor → 6-section reply from MedEx.
- **"Valmor er kaj ki?"** → same as above (intent regex still matches).
- **"Valm"** → search returns Valmor + Valmore + Valmac → no exact match → "Did you mean Valmor, Valmore, or Valmac?" question; no 6-section.
- **"Acemox"** → MedEx returns Acetazolamide page → correct generic, even though internal knowledge previously had a manual mapping — the mapping list is gone, so MedEx is the only source.
- **"Xyzbrand"** → search returns 0 brand links → `<medex_miss>` → "Verified data not found…" + footer + inventory CTA.
- **"27-4 er sale koto?"** → no medicine intent, `NON_MED_KEYWORDS` blocks "sale" → no Spider call, normal sales flow.
