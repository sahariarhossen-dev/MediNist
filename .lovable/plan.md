## Goal

Make the search results in the "New Product Target" modal unambiguous by showing each product's strength and a format badge alongside the brand name.

## Change

Edit only `src/components/staff/AddProductTargetSheet.tsx`:

1. Extend the local `Medicine` interface to also include `product_size: string | null`, `product_type: string | null`, and `unit_format: string | null`. The existing `search_medicines` RPC already returns the full `medicines` row, so no SQL/backend change is required.

2. Update the search-result row rendering:
   - **Line 1**: `{brand_name}` + (if present) ` {product_size}` inline, followed by a small shadcn `Badge` (variant `secondary`, rounded, `text-[10px]`) showing `product_type ?? unit_format` when available.
   - **Line 2**: `company_name` (unchanged).
   - Layout: flex row, name/strength truncates, badge stays on the right side of line 1 and does not wrap awkwardly.

3. Apply the same enriched layout to the "picked" chip at the top of the form so the selected product also shows strength + format badge.

## Out of scope

- No changes to the RPC, DB schema, or other search surfaces.
- No changes to stock display logic.
