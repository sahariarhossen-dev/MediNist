## Goal

Fix the three search bugs on `/catalog-search` (CatalogSearch.tsx) by moving from a client-side full-table load to a debounced server-side query against `master_medicines`.

## Root cause

`src/pages/CatalogSearch.tsx` currently does `supabase.from("master_medicines").select("*").order("brand_name")` on mount. Supabase caps responses at 1000 rows, so only the first ~1000 of 21,168 rows ever reach the client. Anything outside that slice (e.g. "ramoril") is invisible, regardless of case. Filtering then runs in JS on that partial set.

## Changes

### 1. `src/pages/CatalogSearch.tsx` — server-side search

- Remove the on-mount `fetchCatalog` that loads all rows. Remove the `catalog` state and the `useMemo` client filter.
- Add `results: MasterMedicine[]`, `searching: boolean`, and keep `searchQuery`.
- Add a 300ms debounce on `searchQuery` (small inline `useEffect` with `setTimeout`/`clearTimeout`; no new dependency).
- On each debounced query:
  - If query is empty → clear `results`, show an empty-state prompt ("Start typing to search the catalog").
  - Otherwise, before firing the request, **clear `results` and set `searching=true`** so stale rows never render against a new query.
  - Run:
    ```ts
    supabase
      .from("master_medicines")
      .select("id,brand_name,generic_name,strength,unit_price,company,format,pack_size,box_size")
      .or(`brand_name.ilike.%${q}%,generic_name.ilike.%${q}%,company.ilike.%${q}%`)
      .order("brand_name")
      .limit(50)
    ```
  - Guard against out-of-order responses with a request-id ref (increment per fire, ignore response if id no longer current). This is what prevents the "wrong product details" / mismatched cards.
- Sanitize the query for PostgREST `or()`: escape `%`, `,`, `(`, `)` and trim. Skip queries shorter than 2 chars to avoid huge result sets.
- Keep the existing expanded-card "Add to inventory" flow as-is; it already binds fields by the selected `med` object so there's no cross-binding once results are properly keyed by `med.id`.
- Ensure `key={med.id}` (already present) and that `expandedId` resets to `null` whenever `searchQuery` changes, so an expanded card from a previous query can't visually attach to a different medicine in the new list.

### 2. Empty / loading / no-results states

- Initial (no query): friendly prompt + "Add manually" link.
- Searching: spinner.
- Query ≥ 2 chars, 0 results: existing "No medicines found" + manual-add link.

### 3. Mobile-first styling

No layout changes — the current card list is already mobile-first (single column, `px-4`, sticky search). Just verify the new states keep the same paddings.

### 4. Out of scope

- No schema changes (indexes on `master_medicines` are optional; with `.limit(50)` and ILIKE on 21k rows performance is fine).
- No changes to `AddPrescriptionSheet` medicine search (that searches the per-pharmacy `medicines` table, different concern).
- No changes to the importer or edge function.

## Verification

After implementation:
1. Search "ramoril" → returns the row (case-insensitive, server-side).
2. Search "RAMORIL" / "Ramoril" → identical results.
3. Type quickly through "ram" → "ramo" → "ramoril": only the final query's results render; no flashing of stale rows.
4. Each expanded card's Add-to-Inventory uses the correct brand/company/price.
