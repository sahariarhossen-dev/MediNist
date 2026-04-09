

## Plan: Master Medicine Catalog with Search-to-Inventory Flow

### Overview
Create a global `master_medicines` table seeded with the uploaded JSON data, then build a search-first flow where pharmacy users can find medicines from the master catalog and add them to their shop inventory with one tap (only entering quantity).

### 1. Database: New `master_medicines` Table

Create a migration for a **public, read-only** global catalog table:

```sql
CREATE TABLE public.master_medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  generic_name text,
  strength text,
  unit_price numeric DEFAULT 0,
  company text,
  format text,
  pack_size text,
  box_size text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.master_medicines ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (global catalog)
CREATE POLICY "Anyone can read master medicines"
  ON public.master_medicines FOR SELECT
  TO authenticated USING (true);

-- No one can modify via client
CREATE POLICY "No client writes"
  ON public.master_medicines FOR INSERT
  TO authenticated WITH CHECK (false);

CREATE POLICY "No client updates"
  ON public.master_medicines FOR UPDATE
  TO authenticated USING (false);

CREATE POLICY "No client deletes"
  ON public.master_medicines FOR DELETE
  TO authenticated USING (false);
```

### 2. Seed the Master Data

After migration, use a script to:
1. Parse `medicine.json` — extract only `brand_name`, `generic_name`, `strength`, `unit_price`, `company`, `format`, `pack_size`, `box_size`
2. Ignore all other fields (`id`, `project_id`, `created_at`, `needs_review`)
3. Insert all ~400+ rows into `master_medicines` via Supabase insert tool (batched)

### 3. New Page: `/catalog-search`

A dedicated full-screen search page optimized for mobile:

- **Header**: Back button + "Add from Catalog" title
- **Search input**: Auto-focused, searches `brand_name` and `generic_name` using `.ilike()` — client-side filtering of fetched data for speed
- **Results list**: Fluid cards showing brand name, generic, company, strength, format, price — all with `truncate` for overflow
- **On tap**: Expands the card inline showing pre-filled details + a quantity input field + "Add to My Inventory" button
- **Add logic**: Inserts into `medicines` table with `pharmacy_id` from user profile, mapping:
  - `name` ← `brand_name`
  - `company_name` ← `company`
  - `product_type` ← `format`
  - `price` ← `unit_price`
  - `stock_quantity` ← user-entered quantity (default 0)
  - `pcs_per_strip` ← parsed from `pack_size` (e.g. "10s" → 10)
  - `strip_per_pack` ← parsed from `box_size` (e.g. "30s" → 3, calculated as box/pack)
- **Duplicate check**: Before inserting, check if a medicine with the same `name` and `company_name` already exists for this pharmacy. If yes, show a toast: "Already in your inventory" and skip.

### 4. Integration Points

- **Inventory page** (`/inventory`): Change the "Add New Product" button to navigate to `/catalog-search` instead of `/add-product`
- **Add Product page** (`/add-product`): Remains available for manual entry of rare items not in catalog — accessible via a "Can't find it? Add manually" link on the catalog search page
- **Route**: Add `/catalog-search` to `App.tsx` as a protected route

### 5. Performance Strategy

- Fetch all master medicines once on mount (400 items is small enough for client-side filtering)
- Use `useMemo` with debounced search for instant results
- No pagination needed at this scale

### Files Modified/Created
- `supabase/migrations/` — new migration for `master_medicines` table
- `src/pages/CatalogSearch.tsx` — new page (search + add-to-inventory flow)
- `src/App.tsx` — add route
- `src/pages/Inventory.tsx` — update "Add New Product" button target
- Data seeding via insert tool (one-time operation)

### Technical Details
- `master_medicines` is a global table — no `pharmacy_id` column, no tenant scoping
- RLS allows SELECT for all authenticated users, blocks all writes from client
- Data seeding uses the Supabase insert tool (service-role level) to bypass write RLS
- `pack_size` values like "10s" will be parsed to extract numeric `pcs_per_strip`; "N/A" maps to `null`

