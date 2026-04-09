

## Plan: Connect Inventory Search to Master Catalog & Validate Sales/Alert Logic

### Current State
- **Inventory page**: searches only the local `medicines` table (shop inventory)
- **CatalogSearch**: separate page that searches `master_medicines` and adds to `medicines`
- **CreateSale**: searches `medicines` table — already correct (only shop inventory)
- **ShortItems**: queries `medicines` with threshold — already correct

### What Needs to Change

**1. Inventory Page — Merge Master Catalog Search Inline** (`src/pages/Inventory.tsx`)

When the search bar is active, query `master_medicines` alongside local `medicines`:
- Show **two sections** in search results: "In Your Inventory" (from `medicines`) and "From Catalog" (from `master_medicines`)
- Tapping an inventory item expands the existing stock-update UI (current behavior)
- Tapping a catalog item expands an inline quick-add row: quantity input + "Add" button
- On add: insert into `medicines` with `pharmacy_id`, mapping fields exactly like CatalogSearch does (brand_name→name, company→company_name, parse pack_size→pcs_per_strip, etc.)
- Duplicate check before insert (same name + company already in medicines)
- After adding, refresh the local medicines list and collapse the card
- Remove the separate "Add New Product" button that navigates to `/catalog-search` — the search bar now handles this directly
- Keep the "Can't find it? Add manually" link at the bottom of catalog results

**2. Sales Page — No Changes Needed**
CreateSale already queries only `medicines` (shop inventory). It already filters by `pharmacy_id`. The stock deduction logic on sale completion is already implemented. This is correct as-is.

**3. Stock Alerts (ShortItems) — No Changes Needed**
ShortItems already queries only `medicines` filtered by `pharmacy_id` with threshold logic (`stock_alert` field or default 5). This matches the requirement exactly — only shop inventory items appear.

**4. Fetch Master Catalog Once for Performance**
- Load all `master_medicines` on Inventory mount (same pattern as CatalogSearch — ~476 items, client-side filter)
- Use `useMemo` with the search query to filter both local medicines and master catalog simultaneously
- Exclude catalog items that already exist in local inventory (by matching brand_name to name)

### Files Modified
- `src/pages/Inventory.tsx` — major refactor to add master catalog search inline

### No Database Changes Required
All tables and RLS policies are already correct.

### Technical Details
- Master medicines fetched once on mount, stored in state
- Local filtering with `useMemo` for instant results
- Catalog→medicines field mapping reused from CatalogSearch: `parsePackSize()` and `computeStripPerPack()` utilities
- The CatalogSearch page (`/catalog-search`) remains accessible as a standalone route but the primary flow is now through the Inventory search bar

