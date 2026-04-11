

## Plan: Add Company Filter to Inventory Search

### Overview
Add a filter icon next to the search bar that opens a bottom sheet with company checkboxes. When filters are active, both inventory and catalog results are filtered to selected companies only. A "Clear" badge appears when filters are active.

### Changes — Single file: `src/pages/Inventory.tsx`

**1. New state variables**
- `filterOpen: boolean` — controls bottom sheet visibility
- `selectedCompanies: Set<string>` — selected company names
- `companySearch: string` — search within the company list

**2. Compute unique company list**
- `useMemo` that collects unique company names from both `medicines` (company_name) and `catalog` (company), sorted alphabetically, filtered by `companySearch`

**3. Search bar redesign (line ~318-348)**
- When `searchOpen`: shrink the search input slightly, add a `SlidersHorizontal` (Lucide) icon button between the search input and the close X
- When filters are active: show a small badge/dot on the filter icon + a "Clear" chip near the search bar
- When not searching: keep existing layout unchanged

**4. Bottom Sheet for company filter**
- Use the existing `Sheet` component (`@/components/ui/sheet`) with `side="bottom"`
- Contents: search input for companies → scrollable checkbox list → "Apply Filter" button
- Each company row: checkbox + company name + count of medicines
- "Select All / Clear All" toggle at top

**5. Filter logic integration (lines ~112-134)**
- `filteredMedicines`: add condition — if `selectedCompanies.size > 0`, only include medicines whose `company_name` is in the set
- `filteredCatalog`: same — filter by `med.company` being in the set

**6. Active filter indicator**
- When `selectedCompanies.size > 0` and search is open: show a small pill/badge like "2 filters" next to the search bar with an X to clear

### UI Details
- Filter icon: `SlidersHorizontal` from lucide-react
- Bottom sheet: rounded top corners, max-height 70vh, scrollable company list
- Checkboxes: use `@/components/ui/checkbox`
- Mobile-friendly: full-width on small screens, thumb-reachable apply button at bottom

### No database or migration changes needed
All filtering is client-side on already-fetched data.

