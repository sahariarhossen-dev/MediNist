

## Plan: Professional Invoice/Receipt Component

### Overview
Replace the current simple invoice dialog in Sales.tsx with a full-page invoice route (`/invoice/:saleId`) featuring a professional, print-optimized layout with dynamic pharmacy data, emerald-themed itemized table, and print/export functionality.

### Changes

**1. New file: `src/pages/Invoice.tsx`**

A dedicated full-page invoice component that:
- Takes `saleId` from URL params
- Fetches sale data, sale_items, pharmacy details, and seller profile from Supabase
- Layout (two-column header):
  - **Left**: Pharmacy name (large bold), address, proprietor name, phone, email — all from `pharmacies` and `profiles` tables
  - **Right**: "INVOICE" title with Receipt icon, confirmed-by (current user's `full_name`), sale type (Retail/Wholesale), invoice ID (`INV-{id.slice(0,11)}`), date/time formatted as `HH:mm / DD-MM-YY`
- **Itemized table**: Emerald green header row (`bg-emerald-600 text-white`), columns: DESCRIPTION, QTY, UNIT PRICE, TOTAL. Alternating row shading.
- **Payment summary** (right-aligned): Subtotal, Discount (%), Subtotal Less Discount, Tax Rate (0.00%), Total Tax, Shipping/Handling, **Balance Due** (bold, larger)
- **Remarks section** at bottom-left
- **Print button** and **Close button** in a top bar, hidden via `@media print`
- Print styles: `@media print { .no-print { display: none; } }` to hide nav, buttons

**2. Update `src/App.tsx`**

Add route: `/invoice/:saleId` → `<Invoice />`

**3. Update `src/pages/Sales.tsx`**

Change the completed sale click handler: instead of opening the dialog, navigate to `/invoice/${sale.id}`. Remove the invoice dialog code entirely.

**4. Data fetching in Invoice.tsx**

```typescript
// Fetch sale
const { data: sale } = await supabase.from("sales").select("*").eq("id", saleId).single();
// Fetch items
const { data: items } = await supabase.from("sale_items").select("*").eq("sale_id", saleId);
// Fetch pharmacy
const { data: pharmacy } = await supabase.from("pharmacies").select("*").eq("id", sale.pharmacy_id).single();
// Fetch seller profile
const { data: seller } = await supabase.from("profiles").select("full_name, phone").eq("id", sale.user_id).single();
```

**5. Print optimization**

- Container: `max-w-2xl mx-auto bg-white rounded-lg shadow-lg` on screen
- `@media print` CSS in index.css: hide `.no-print`, remove shadows/margins, full-width layout
- Works for both A4 and 80mm thermal (content reflows naturally)

### Files affected
- `src/pages/Invoice.tsx` — new file (invoice component)
- `src/App.tsx` — add invoice route
- `src/pages/Sales.tsx` — navigate to invoice page instead of dialog
- `src/index.css` — add print media styles

