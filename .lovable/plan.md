

## Plan: Redesign Inventory Page with Search-Driven Stock Update Workflow

### Overview

Transform the Inventory page into a search-driven inventory update tool. When searching, results show expandable cards where users can input units to add, with real-time stock calculation. Also remove the "Total Strips in Stock" field from AddProduct.

### Changes

**1. Rewrite `src/pages/Inventory.tsx`**

- **Search bar**: Keep existing toggle logic. Add an inner X button inside the search input to clear text (separate from the outer X that exits search mode).
- **Search results**: When `searchQuery` is non-empty, filter medicines client-side. Show results as cards.
- **Expandable cards**: Track `expandedId` state. Clicking a card toggles expansion.
  - **Collapsed**: Pill icon, name, company, price (existing layout).
  - **Expanded**: Same Row 1 + a unit input box on the right. Row 2 shows: `৳ {price}`, `pre-stock: {stock_quantity}`, `Current stock: {calculated}`.
  - **Calculation**: `currentStock = stock_quantity + (unitsInput * strip_per_pack)`. Need to fetch `strip_per_pack` — update the Medicine interface and query to include `strip_per_pack` and `pcs_per_strip`.
- **Default view** (no search): Show full medicine list in standard card format (non-expandable, as currently).
- **Save logic**: When user enters units in expanded card, provide a confirm mechanism or auto-save to update `stock_quantity` in Supabase via `.update()`.

**2. Modify `src/pages/AddProduct.tsx`**

- **Delete "Total Strips in Stock"** field (lines 208-217): Remove the `totalStrips` input, its state, and related form restoration logic.
- Update `handleSave`: For tablet/capsule, `stock_quantity` defaults to 0 instead of using `totalStrips`.
- Keep `totalPcs` display removed since it depended on `totalStrips`.

### Technical Details

- Medicine interface adds: `strip_per_pack: number | null; pcs_per_strip: number | null`
- Supabase query updated to `select("*")` already fetches all columns — no query change needed
- Real-time calc: `newStock = (med.stock_quantity || 0) + (units * (med.strip_per_pack || 1))`
- Expanded card uses `transition-all duration-200` for smooth expand/collapse
- Unit input uses `type="number"` with min=0

