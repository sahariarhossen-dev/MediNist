## Goal

Replace the current `ilike` / client-side filtering on `master_medicines` with Postgres Full-Text Search backed by a GIN index, so searching across 21k+ rows stays instant even with fast typing.

## 1. Database migration

Add an immutable, generated `tsvector` column over `brand_name` + `generic_name` + `company`, plus a GIN index. Using `simple` config (not `english`) because brand names are not English words and we don't want stemming like "tablets" → "tablet" silently dropping matches.

```sql
-- Generated search vector (auto-maintained, no trigger needed)
ALTER TABLE public.master_medicines
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(brand_name, '')),   'A') ||
  setweight(to_tsvector('simple', coalesce(generic_name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(company, '')),      'C')
) STORED;

-- GIN index — the workhorse
CREATE INDEX idx_master_medicines_search_vector
  ON public.master_medicines
  USING GIN (search_vector);

-- Helpful secondary index for company-filter dropdown queries
CREATE INDEX IF NOT EXISTS idx_master_medicines_company
  ON public.master_medicines (company);
```

Weights (A/B/C) let us rank brand hits above generic hits above company hits when we use `ts_rank` ordering later.

## 2. Why FTS only handles part of the problem

FTS matches whole tokens, prefix tokens (`amoxi:*`), and is case-insensitive — but it does **not** handle:

- Sub-string matches inside a token (`"mox"` inside `"amoxicillin"`).
- The "strip non-alphanumerics" normalization already used in `src/lib/searchUtils.ts` (`A-mactin` → `amactin`).

For the catalog autocomplete this is acceptable as long as we use **prefix search** (`term:*`). Users typing `"amox"` will match `"amoxicillin 500"`. We will sanitize the query and append `:*` to every token:

```ts
const toTsQuery = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")     // strip punctuation, keep spaces
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`)             // prefix match per token
    .join(" & ");                     // AND across tokens
```

## 3. Frontend changes (`src/pages/Inventory.tsx`)

Swap the on-demand catalog `.or("brand_name.ilike...")` block for `.textSearch()`:

```ts
let q = supabase
  .from("master_medicines")
  .select("*")
  .order("brand_name", { ascending: true })
  .range(0, 4999);

if (selectedCompanies.size > 0) {
  q = q.in("company", [...selectedCompanies]);
}

const tsq = toTsQuery(debouncedSearch);
if (tsq) {
  q = q.textSearch("search_vector", tsq, {
    type: "websearch",  // actually we pass the raw tsquery — see below
    config: "simple",
  });
}
```

The supabase-js `.textSearch(column, query, { type, config })` accepts:
- `type: "plain"` → `plainto_tsquery` (no prefix support — wrong for us)
- `type: "phrase"` → `phraseto_tsquery` (wrong)
- `type: "websearch"` → `websearch_to_tsquery` (no `:*` prefix — wrong)
- omit `type` → raw `to_tsquery` (supports `term:*` — **this is what we want**)

So the actual call is:

```ts
q = q.textSearch("search_vector", tsq, { config: "simple" });
```

## 4. Keeping the UI snappy while typing

The current code already has a 250 ms debounce + stale-response guard via a `Symbol` request id. Keep both. The change is just:

- Switch the catalog fetch query body to `.textSearch()` as above.
- Keep `range(0, 4999)` as a safety cap.
- Keep loading spinner under the "From Catalog" header.

GIN-indexed `@@` lookups on 21k rows return in single-digit milliseconds, so the perceived bottleneck becomes network round-trip, not the DB. Debouncing already hides that.

## 5. `CatalogSearch.tsx`

`src/pages/CatalogSearch.tsx` currently fetches the entire catalog on mount (also capped at 1000 rows silently) and filters client-side. After the FTS column lands, switch it to the same on-demand `.textSearch()` flow with debounce. Not strictly required for this task, but worth flagging — the same 1000-row truncation bug exists there.

## Files touched

- New migration: generated column + GIN index + company btree index.
- `src/pages/Inventory.tsx` — swap `.or(...ilike...)` for `.textSearch(...)` + add `toTsQuery` helper (or place in `src/lib/searchUtils.ts`).
- Optional follow-up: `src/pages/CatalogSearch.tsx` mirror the same pattern.

## What stays the same

- Local-inventory exclusion (`name|company` Set).
- Debounce, stale-response guard, loading spinner, section headers, badges.
- `handleAddFromCatalog` and the prepend-to-`medicines` behavior.
- RLS, types regeneration is automatic after the migration.

## Open question before I build

The `to_tsvector('simple', ...)` config does no stemming, which is correct for brand names but means `"tablets"` won't match `"tablet"` in generic names. For a pharmacy catalog this is almost certainly the right call (medical terms shouldn't be stemmed). Confirm before I run the migration, or say "use english" if you'd rather have stemming on generic names.
