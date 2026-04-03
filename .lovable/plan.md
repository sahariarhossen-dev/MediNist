

## Plan: Sales Page UI/UX Refinements

### Changes in `src/pages/CreateSale.tsx`

**1. Search bar clear (X) icon** (lines 194-205)
- Add an X button inside the search bar (before the search icon divider) that appears when `searchQuery` is non-empty
- Clicking it clears `searchQuery` and `searchResults`

**2. Auto-collapse logic** (lines 78-84)
- Update `toggleExpand` to collapse all other items when expanding one (only one expanded at a time)
- Also collapse all items when `addToCart` is called and when search starts (in the search `useEffect`)

**3. Prepend new items** (line 61)
- Change `[...prev, { medicine, quantity: 1, expanded: false }]` to `[{ medicine, quantity: 1, expanded: false }, ...prev]` so new items appear at the top

**4. Item layout** — already done in previous iteration (product_type as superscript next to name, company_name below). No changes needed here.

### No other files affected. All price calculation logic stays unchanged.

