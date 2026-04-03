

## Company Selection Flow

### Overview
Create a dedicated "Add New Company" page that the user navigates to from the Company Name field on the Add Product form. Users can search, select an existing company, or add a new one. Selection returns to the Add Product form with the company name pre-filled.

### Database Migration
Create a `companies` table:
```sql
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pharmacy_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their pharmacy companies"
  ON public.companies FOR ALL
  USING (pharmacy_id = (SELECT profiles.pharmacy_id FROM profiles WHERE profiles.id = auth.uid()));
```

### New Files

| File | Purpose |
|------|---------|
| `src/pages/AddCompany.tsx` | Company selection/creation page |

### Changes to Existing Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/add-company` route (protected, no bottom nav) |
| `src/pages/AddProduct.tsx` | Replace Company Name text input with a clickable field that navigates to `/add-company`, read selected company from URL search params or navigation state on return |

### AddCompany Page Design

**Header**: Back arrow + "Add New Company" title (same style as AddProduct header).

**Search input**: Large rounded input field labeled "Company Name" at top. Filters the list below as user types.

**Add button**: Below input, a rounded bordered button "+ Add New Company". Saves the typed name to the `companies` table with the user's `pharmacy_id`, then selects it and navigates back.

**Company list**: Below the button, show all companies for the pharmacy in clean rounded bordered boxes (matching the sketch). Filtered by the search input. Clicking a company navigates back to `/add-product` with the company name passed via React Router state (`navigate("/add-product", { state: { companyName: "..." } })`).

### AddProduct Changes

- The Company Name field becomes a read-only styled div that shows the selected company name (or placeholder text).
- On mount, check `location.state?.companyName` and pre-fill. Preserve other form fields by passing them as state when navigating to `/add-company` and restoring on return.
- Navigation to add-company: `navigate("/add-company", { state: { formData: { name, productType, ... } } })`.

### Technical Details
- Uses `useNavigate` and `useLocation` for state passing between pages
- Supabase query: `.from("companies").select("*").eq("pharmacy_id", pharmacyId).order("name")`
- RLS policy mirrors the medicines table pattern
- Types file will auto-update after migration

