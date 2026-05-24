## Problem

The Company Filter modal in `Inventory.tsx` currently derives its company list from only two sources:
1. The pharmacy's local `medicines` inventory
2. The current `catalogResults` (max 50 rows from a search query)

This means the filter list is incomplete — users see only companies from their own inventory plus whatever happens to be in the current search results, not the full set of companies available in the global `master_medicines` catalog.

## Discovery

A quick `COUNT(DISTINCT company)` on `master_medicines` returns **81 distinct companies** — a tiny, easily client-side-manageable set.

## Changes — `src/pages/Inventory.tsx`

1. **Add `masterCompanies` state & fetch effect**
   - New state: `masterCompanies: string[]` and `companiesLoading: boolean`.
   - `useEffect` keyed on `[filterOpen]`:
     - When `filterOpen` becomes `true` and `masterCompanies.length === 0`, fetch:
       ```ts
       supabase
         .from("master_medicines")
         .select("company")
         .not("company", "is", null)
         .order("company", { ascending: true })
         .limit(1000)
       ```
     - Deduplicate client-side with a `Set`, sort, and store in `masterCompanies`.
     - This is safe because there are only ~81 distinct companies (well under the 1000-row limit).

2. **Replace `allCompanies` source**
   - Change the `allCompanies` `useMemo` to source from `masterCompanies` instead of `medicines` + `catalogResults`:
     ```ts
     const allCompanies = useMemo(() => masterCompanies, [masterCompanies]);
     ```
   - Keep the existing `filteredCompanies` logic (case-insensitive filter on `companySearch`) exactly as-is.

3. **Add a loading state inside the modal**
   - While `companiesLoading` is true, show a small spinner or skeleton in the list area so the modal doesn't appear empty on first open.

4. **No other changes**
   - The modal UI, checkbox list, "Select All / Clear All", search input, and Apply button remain untouched.
   - The `selectedCompanies` logic, filtering of `filteredMedicines` and `filteredCatalog`, and all handlers stay identical.

## Out of scope
- No database migrations needed (81 distinct companies fits comfortably in a 1000-row query).
- No new views, functions, or indexes.
- No changes to `CatalogSearch.tsx`, `AddPrescriptionSheet`, or other components.

## Verification
1. Open Inventory → tap the filter icon → the modal opens and shows all ~81 company names within ~200ms.
2. Type "ACI" in the search box → list instantly narrows to matching companies (case-insensitive).
3. Select a company → tap Apply → local inventory and catalog results are filtered correctly.
4. Close and reopen filter → companies load from state (no second network request).
5. Mobile viewport: modal remains bottom-sheet style, scrollable, fully responsive.