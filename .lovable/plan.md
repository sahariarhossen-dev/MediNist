

## Plan: Build POS "Create New Sale" Interface

### Overview
Create a new page `/create-sale` with a full POS interface matching the uploaded sketches. The "Create New Sale" button on the Sales page will navigate to this new page. No database migration needed — we'll use the existing `medicines` table for search and a future `sales`/`sale_items` table for persistence (Draft/Complete Sale will show toast for now until sales tables are created).

### Database Migration
Create `sales` and `sale_items` tables to support drafts and completed sales:

- **`sales`** — `id`, `pharmacy_id`, `user_id`, `sale_type` (retail/wholesale), `subtotal`, `discount_percent`, `discount_amount`, `total`, `status` (draft/completed), `created_at`
- **`sale_items`** — `id`, `sale_id` (FK), `medicine_id` (FK), `medicine_name`, `company_name`, `quantity`, `unit_price`, `total_price`
- RLS: scoped to user's pharmacy via `profiles.pharmacy_id`

### File Changes

**1. New page: `src/pages/CreateSale.tsx`**
The main POS page with:

- **Header**: Left — profile icon + staff name (from `profile.full_name`) + pharmacy name (from `pharmacyName`). Right — Retail/Wholesale dropdown styled as a pill/badge selector.
- **Search bar**: Queries `medicines` table by name, debounced. Results show medicine name, company_name, and MRP (price).
- **Expandable cart items**: Clicking a search result adds it to cart in collapsed state showing: serial number, name, company, quantity x price, total, ৳ symbol. Clicking expands to show quantity input. Quantity changes recalculate line total.
- **Summary section**: Shows subtotal, discount line (`Less_Diss - 10%`), and bold net total with `= ৳X` format.
- **Footer**: Fixed bottom bar with "Draft" button (left, outline style) and "Complete Sale" button (right, solid emerald/dark).

**2. Update `src/pages/Sales.tsx`**
Change the "Create New Sale" button from `toast.info()` to `useNavigate()` → `/create-sale`.

**3. Update `src/App.tsx`**
Add route: `/create-sale` → `<ProtectedRoute><CreateSale /></ProtectedRoute>` (no AppLayout/BottomNav — full-screen POS).

### UI/UX Details
- Dark/white theme matching sketches — clean white background, black text, minimal borders
- Search bar with rounded-xl, search icon, border
- Cart items separated by thin dividers, numbered list
- Quantity shown as `5*10` format (quantity × pcs_per_strip)
- "popular" badge under medicine name (using product_type or a tag)
- STK (stock) indicator next to items
- Fixed bottom action bar with two large buttons
- No bottom navigation on this page (dedicated POS screen)
- Back/close button in header to return to `/sales`

### Technical Approach
- Fetch medicines from Supabase with `.ilike('name', '%query%')` search
- Local state for cart items with quantity management
- Real-time calculation: subtotal, 10% discount, net total
- Draft saves to `sales` table with status='draft', Complete saves with status='completed'
- Use `useAuth()` for profile/pharmacy context

