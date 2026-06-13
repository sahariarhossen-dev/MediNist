## Fix: AddCompany screen should pull from master_medicines catalog

### Problem
The "Select Your Company" screen (`/add-company`) currently queries the local per-pharmacy `companies` table and lets users manually create new company entries. This produces duplicate/variant company names across pharmacies and breaks multi-tenant consistency.

### Solution Overview
Replace the local `companies` query with a distinct lookup against the canonical `master_medicines` catalog, remove manual creation entirely, and keep the existing selection UX.

### Changes

#### 1. Database — new helper function
Create `public.get_master_companies(_search text DEFAULT NULL)`:
- Returns distinct, non-null company names from `master_medicines`
- Optional case-insensitive search via `ILIKE`
- Ordered alphabetically
- Exposed to authenticated users (no extra RLS needed; `master_medicines` already allows authenticated SELECT)

#### 2. Frontend — rewrite `src/pages/AddCompany.tsx`
- **Data fetching**: replace `supabase.from('companies')...` with `supabase.rpc('get_master_companies', { _search: searchTerm })`
- **Search**: wire the existing "Search companies..." input to call the RPC on change (with debounce)
- **Remove manual creation**: delete all states/logic/JSX for `showInlineAdd`, `newName`, `adding`, `handleSaveNew`, duplicate-checking, inline form, and the "+ Add New Company" button
- **Selection behavior**: keep `handleSelect` exactly as-is (passes `companyName` back to `/add-product` via navigation state)
- **Loading & empty states**: adapt existing skeleton and empty-state copy to reference the master catalog

### Why this approach
- `master_medicines` has ~21k rows but only ~81 distinct companies; a DB-side `DISTINCT` avoids bandwidth waste and the 1000-row PostgREST limit
- Removing manual creation enforces the canonical company list, preventing future duplicates
- No changes required to `AddProduct.tsx` or any other screen — the navigation contract stays identical

### Acceptance criteria
- [ ] Typing "square" in the search box shows "Square Pharmaceuticals Ltd." (or similar) from the master catalog
- [ ] No "+ Add New Company" button is visible
- [ ] Selecting a company navigates back to Add Product with the correct company name filled in
- [ ] Empty search shows all ~81 distinct companies alphabetically