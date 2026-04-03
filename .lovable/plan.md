

## Add New Product Page

### Problem
The `medicines` table lacks columns needed for the product type logic (tablet/capsule vs syrup/injection/cream). A migration is required before building the form.

### Database Migration
Add columns to `medicines`:
- `product_type` (text, nullable) — e.g. "Tablet", "Capsule", "Syrup", "Injection", "Cream"
- `product_size` (text, nullable) — e.g. "100ml", "50gm" (for syrup/injection/cream)
- `strip_per_pack` (integer, nullable) — for tablet/capsule
- `pcs_per_strip` (integer, nullable) — for tablet/capsule
- `stock_alert` (integer, nullable, default 0) — minimum warning level

The existing `stock_quantity` column will store: total strips (tablet/capsule) or total units (syrup/injection/cream).

### New Files

| File | Purpose |
|------|---------|
| `src/pages/AddProduct.tsx` | Full add-product form page |

### Changes to Existing Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/add-product` route (protected, no bottom nav — standalone page) |
| `src/pages/Inventory.tsx` | Wire "Add New Product" button to navigate to `/add-product` |

### AddProduct Page Design

**Header**: Back arrow + "Add New Product" title. Clicking back returns to `/inventory`.

**Form fields** (clean single-page scroll):
1. **Medicine Name** — text input (required)
2. **Company Name** — text input with placeholder for generic/company name (maps to `generic_name`)
3. **Product Type** — select dropdown: Tablet, Capsule, Syrup, Injection, Cream

**Conditional fields based on Product Type:**

If Tablet or Capsule:
- Strip per Pack (number)
- Pcs per Strip (number)
- Total Strips in Stock (number) → saved as `stock_quantity`
- Auto-calculated "Total Pcs" shown as read-only info

If Syrup, Injection, or Cream:
- Product Size (text, e.g. "100ml")
- Total Quantity in Stock (number) → saved as `stock_quantity`

**Always visible:**
- Stock Alert (number)
- MRP (number) → saved as `price`

**Save button**: Inserts into `medicines` with `pharmacy_id` from auth context. Shows success toast via sonner, navigates back to `/inventory`.

### Technical Details
- Uses `useNavigate` for routing, `useAuth` for pharmacy_id
- Form state managed with `useState` (simple enough, no need for react-hook-form)
- Input validation: name required, at least MRP or stock fields filled
- The route is NOT wrapped in `AppLayout` (no bottom nav on form pages — back button suffices)
- Company Name stored in `generic_name` column (existing column, repurposed)

