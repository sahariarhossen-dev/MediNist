## Goal

Make medicine queries fetch real data from medex.com.bd live (via Spider.cloud), then summarize it in the existing 6-section MediNist Standard Format. If the scrape fails or returns nothing, fall back to internal pharmacological knowledge with the existing "could not find verified data" disclaimer. Inventory check stays consent-gated on the next turn.

## Required secret

- `SPIDER_API_KEY` — Spider.cloud API key. I will request it via the secrets tool before writing code; the function will not deploy any scrape calls until it is set.

## Changes

### 1. New helper inside `supabase/functions/ai-chat/index.ts`

Add `fetchMedexData(name: string)`:
- Detects "medicine intent" in the latest user turn with a small regex/keyword list (English + Banglish: `er kaj ki`, `kno khai`, `dose`, `kibhabe khabo`, `about <X>`, `what is <X>`, `side effect`, etc.) and extracts the candidate brand token (last capitalised word OR token immediately before the trigger phrase).
- Calls Spider.cloud `POST https://api.spider.cloud/crawl` with:
  - `url`: `https://medex.com.bd/search?search=<name>`
  - `limit: 2`, `return_format: "markdown"`, `request: "smart_mode"`, `country_code: "bd"`
  - First page = search results → extract first `/brands/<id>/...` link from the markdown. Then second crawl call on that brand URL.
- Parses the brand-page markdown to pull: `brand`, `generic`, `indication`, `dose & administration`, `side effects`, `contraindications`, `unit price`, and "Brands of same generic" list (top 3 by price/popularity).
- Returns a typed object `{ source: "medex", brand, generic, indications, dosage, timing?, price, alternatives[], warnings }` or `null` on miss.
- Caches results for 24h in a new lightweight table `medex_cache (name_key text primary key, payload jsonb, fetched_at timestamptz)` so repeat lookups are free. Created via migration.

### 2. Wire it into the chat handler

Before composing the LLM call:
- If medicine-intent detected on the latest user message, call `fetchMedexData`.
- If hit → inject a fenced `MEDEX_DATA` block into the system prompt right under the LIVE PHARMACY DATA block, containing the parsed JSON. Add a new system rule (rule 24): "When a `MEDEX_DATA` block is present, you MUST build the 6-section reply using ONLY those fields. Do NOT use internal knowledge for generic/indication/dose. Mark price as 'আনুমানিক' if missing."
- If miss → no MEDEX_DATA block; existing rule 21 fallback (`could not find verified data` if uncertain, otherwise internal-knowledge 6-section) takes over.

Inventory CTA (rule 22) and doctor footer remain unchanged.

### 3. Edit rule 21 in the system prompt

- Remove the "all medical info comes from your internal pharmacological knowledge" sentence.
- Replace with: "When a `MEDEX_DATA` block is present, treat it as the source of truth and cite nothing else. When it is absent, you may use internal pharmacological knowledge, and if not 100% certain, output the verified-data-not-found disclaimer."
- Keep the verified brand→generic mapping list as a safety net for the no-MEDEX_DATA path.

### 4. New migration

```sql
create table public.medex_cache (
  name_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.medex_cache enable row level security;
-- Only the edge function (service role) reads/writes; no user-facing policies needed.
```

### 5. No frontend changes

`ChatMessage`, `AIAssistant`, and the DB schema for chat are untouched. Inventory shop name continues to use the logged-in pharmacy (no hardcoded "Naseer Medical Hall").

## Technical details

- Spider.cloud chosen over direct fetch because medex.com.bd uses Cloudflare + dynamic content; Spider's `smart_mode` handles JS rendering and returns clean markdown.
- Two Spider calls per uncached query (~1.5–3s total). Cache makes subsequent same-medicine lookups instant.
- Robust parser uses simple regex on markdown headings (`### Generic Name`, `### Dosage & Administration`, etc. — MedEx is consistent). On parse failure, returns `null` and the AI falls back gracefully.
- Cost control: only crawl when medicine intent is detected — non-medicine prompts (sales, dues, stock numerics) skip Spider entirely.

## Verification scenarios

- "Napa er kaj ki?" → Spider hits MedEx → 6-section reply with real Square Pharma data, real ৳ price, real same-generic alternatives from MedEx → CTA → footer. Cached for 24h.
- "Acemox kno khai?" → MedEx returns Acetazolamide page → correct glaucoma/altitude info, NOT amoxicillin.
- "Xyzbrand er kaj ki?" → Spider returns 0 brand links → fallback → "could not find verified data" disclaimer + footer + CTA.
- Spider down / no `SPIDER_API_KEY` → silent fallback to internal-knowledge path; user still gets a useful reply.
- "27-4 er sale koto?" → no medicine intent → no Spider call → unchanged behaviour.

## Out of scope

- Frontend UI changes.
- Schema additions beyond `medex_cache`.
- Replacing DeepSeek / Lovable AI.
