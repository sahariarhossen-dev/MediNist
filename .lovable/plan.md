

## Plan: Add Company Filter to Short Items Page

### Overview
Add a searchable company dropdown filter to the top-right of the Short Items header, allowing users to filter low-stock items by manufacturer.

### Changes — `src/pages/ShortItems.tsx`

**1. Extract unique companies from fetched data**
- After fetching low-stock items, derive a unique sorted list of `company_name` values from the medicines query (add `company_name` to the select)
- Store in state: `companies` array and `selectedCompany` (default: `"all"`)

**2. Add Select filter in header row**
- Place a `Select` component (from `src/components/ui/select.tsx`) to the right of the "Short Items" title using `ml-auto`
- Options: "All Companies" + each unique company name
- Styled with `w-[160px]` white bg, `shadow-sm`, `rounded-lg`, emerald focus ring (`focus:ring-emerald-500`)

**3. Filter displayed items**
- Compute `displayedItems` from `items` filtered by `selectedCompany`
- Table renders `displayedItems` instead of `items`

**4. Update LowStockItem interface**
- Add `company_name: string | null` to the interface and mapping

**5. Empty state**
- When filter is active and no results: show "No short items for this company" with a package/alert icon

No database or routing changes needed.

