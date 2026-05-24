## Root cause

`src/pages/Inventory.tsx` (the page users actually use to add products from the Global Catalog) loads the entire `master_medicines` table on mount:

```ts
supabase.from("master_medicines").select("*").order("brand_name")
```

Supabase caps responses at 1000 rows, so only the first ~1000 of 21,168 medicines ever reach the client. "ramoril" is well past that slice, so it can never be found by the client-side `filteredCatalog` filter. (CatalogSearch.tsx was already fixed in the previous turn; Inventory.tsx is the remaining offender.)

## Changes — `src/pages/Inventory.tsx` only

1. **Remove the catalog preload**
   - Drop the second leg of the `Promise.all` in `fetchData` (the `master_medicines` select).
   - Drop the `catalog` state. Local inventory load (`medicines`) stays untouched.

2. **Add debounced server-side catalog search**
   - New state: `catalogResults: MasterMedicine[]`, `catalogSearching: boolean`.
   - New ref: `catalogReqIdRef` for out-of-order response protection.
   - `useEffect` keyed on `[searchQuery, searchOpen]`:
     - If `!searchOpen` or trimmed query length < 2 → invalidate, clear results, return.
     - Sanitize query for PostgREST `.or()` (strip `, ( ) % *`).
     - After 300ms debounce, run:
       ```ts
       supabase
         .from("master_medicines")
         .select("id,brand_name,generic_name,strength,unit_price,company,format,pack_size,box_size")
         .or(`brand_name.ilike.%${safe}%,generic_name.ilike.%${safe}%,company.ilike.%${safe}%`)
         .order("brand_name", { ascending: true })
         .limit(50)
       ```
     - Drop response if `myId !== catalogReqIdRef.current`.
     - Toast on error; set `catalogResults` on success.

3. **Replace `filteredCatalog` derivation**
   - Remove the `useMemo` that filtered `catalog` client-side.
   - New `filteredCatalog` derives from `catalogResults`:
     - Exclude items already in local inventory (same `brand_name|company` key as today).
     - Apply the existing company-filter (`selectedCompanies`) on top.
   - The "From Catalog (N)" section, expand-and-add UX, and `handleAddFromCatalog` stay exactly as-is — they already bind by the selected `med` object and `key={med.id}`.

4. **Company filter source**
   - `allCompanies` currently unions `medicines` + `catalog`. With `catalog` gone, it becomes `medicines` ∪ `catalogResults`. Acceptable: filter chip list grows as the user types, which mirrors what's actually searchable. No UI change.

5. **Loading state**
   - `loading` now reflects only the medicines query. Show a small spinner in the catalog section while `catalogSearching` is true (mirrors CatalogSearch.tsx).

6. **No-results copy**
   - Keep existing "No medicines found" block, shown when `searchQuery` length ≥ 2, `catalogSearching` is false, and both `filteredMedicines` and `filteredCatalog` are empty.

## Out of scope

- No changes to `master_medicines` schema or indexes (ILIKE on 21k rows with `.limit(50)` is fine).
- No changes to `CatalogSearch.tsx` (already fixed).
- No changes to `AddPrescriptionSheet` (searches per-pharmacy `medicines`, different concern).
- No changes to the importer or edge function.

## Verification

1. Open Inventory → tap search → type "ramoril" → row appears under "From Catalog" within ~300ms.
2. "RAMORIL" / "Ramoril" / "ramoril" return identical results (case-insensitive).
3. Type "ram" → "ramo" → "ramoril" quickly: only the final query's results render (request-id guard).
4. Tap a catalog card, enter qty, Add → correct brand/company/price inserted into `medicines`; row also disappears from "From Catalog" because it's now in local inventory.
5. Mobile viewport: layout unchanged, search bar + cards remain single-column and responsive.
