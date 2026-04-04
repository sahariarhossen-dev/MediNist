

## Plan: Draft/Complete Status in Sales History + Click Interactions

### Overview
Show both draft and completed sales in the Sales History list with status badges. Clicking a completed sale opens a view-only invoice dialog. Clicking a draft sale navigates to CreateSale with that draft's items pre-loaded for editing.

### Changes

**1. `src/pages/Sales.tsx` — Show all statuses + badges + click handlers**

- Remove the `.eq("status", "completed")` filter so both draft and completed sales appear
- Add `subtotal`, `discount_amount`, `discount_percent` to the select query
- Add a status badge in top-right of each row: green `Complete` or gray `Draft`
- Add an invoice dialog state (`viewingSale`) for completed sales — a `Dialog` with sale details (non-editable)
- Clicking a completed sale opens the dialog; clicking a draft navigates to `/create-sale?draft=SALE_ID`
- Today's total calculation only counts completed sales

**2. `src/pages/CreateSale.tsx` — Load draft sale on mount**

- Read `draft` query param from URL on mount
- If present, fetch the sale + sale_items from Supabase, then fetch each medicine's current data
- Populate `cartItems` with the fetched items and set `saleType` from the draft
- Store `draftId` in state
- When saving (draft or complete): if `draftId` exists, UPDATE the existing sale row instead of INSERT, delete old sale_items and re-insert
- Stock deduction only happens on "completed" (already implemented)

**3. Invoice View Dialog (in Sales.tsx)**

A simple `Dialog` component showing:
- Invoice ID, date/time, status
- Fetch `sale_items` for the selected sale and display: medicine name, qty, unit price, total
- Subtotal, discount, net total at bottom
- Close button only — no editing

### Files affected
- `src/pages/Sales.tsx` — status badges, click handlers, invoice dialog
- `src/pages/CreateSale.tsx` — draft loading + update logic

### No database migrations needed
The `sales` table already has a `status` column with default `'draft'`. The `sale_items` table has all needed fields.

