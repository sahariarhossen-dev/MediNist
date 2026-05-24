## Root cause

`master_medicines` has **21,168 rows** across 81 companies. The current code does:

```ts
supabase.from("master_medicines").select("*").order("brand_name", { ascending: true })
```

Supabase caps unranged selects at **1000 rows**, so only the first 1000 brand names (alphabetical "A…") ever reach the client. When you filter by "ACI Limited", the in-memory filter only sees the ~56 ACI items whose brand names start with "A" — every "B–Z" ACI brand was never fetched. The company filter list itself is also incomplete for the same reason.

## Fix strategy

Stop loading the entire master catalog up front. Instead:

1. **On mount** — fetch only what's needed to render the default screen and populate the company filter:
   - Local `medicines` (unchanged).
   - The full **distinct company list** from `master_medicines`, paginated in batches of 1000 via `.range()` until exhausted, then deduped client-side. One-time cost, small payload (just one text column).

2. **On demand (dual mode)** — when `selectedCompanies.size > 0` or there's a search query, fetch the catalog rows server-side:
   ```ts
   let q = supabase
     .from("master_medicines")
     .select("*")
     .order("brand_name", { ascending: true })
     .range(0, 4999);                                   // generous ceiling
   if (selectedCompanies.size > 0) q = q.in("company", [...selectedCompanies]);
   if (searchQuery.trim()) q = q.or(
     `brand_name.ilike.%${term}%,generic_name.ilike.%${term}%,company.ilike.%${term}%`
   );
   ```
   Largest single company (ACI ~840) fits in one page, so no infinite scroll is required for the company-filter case. Search-without-company is capped at 5000 results, which is more than enough for an autocomplete-style lookup.

3. **Debounce** the search-triggered fetch (~250 ms) so each keystroke doesn't hit Supabase.

4. **Loading state** for the catalog section — small inline spinner under the "From Catalog" header so the user sees the section refresh, without disturbing the inventory above.

## Preserve

- Local-inventory exclusion (`name|company` key set) — unchanged, still applied client-side after the fetch returns.
- All existing UI: section headers, badges, expand-to-add flow, manual-add link, long-press edit/delete, filter sheet.
- `handleAddFromCatalog` still prepends to `medicines`, which still causes the row to drop out of `filteredCatalog` on the next render.

## Files

- `src/pages/Inventory.tsx` — only file touched.
- No DB, RLS, types, or `CatalogSearch.tsx` changes.

## Technical notes

- Replace the single `catalog` state with: `catalogCompanies: string[]` (mount-time) + `catalog: MasterMedicine[]` (on-demand, replaced per query).
- `allCompanies` now merges `catalogCompanies` with companies present in local `medicines`.
- New `useEffect` keyed on `[selectedCompanies, debouncedSearch, isDualMode]` performs the on-demand fetch. When `isDualMode` is false, clear `catalog` to `[]`.
- Keep an `AbortController` (or stale-response guard via a request id) so a fast typer doesn't get an out-of-order result.
