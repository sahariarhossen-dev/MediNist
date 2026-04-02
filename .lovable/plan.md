

## Inventory Page at `/inventory`

### Overview
Create an inventory page matching the reference image: header with search icon, "Add New Product" button, and a list of medicines fetched from Supabase, sorted A-Z.

### New Files

| File | Purpose |
|------|---------|
| `src/pages/Inventory.tsx` | Inventory page component |

### Changes to Existing Files

**`src/App.tsx`**
- Import `Inventory` page
- Add protected route: `/inventory` wrapped in `AppLayout`

### Inventory Page Design

**Header area** (reuses the existing app header from Index pattern):
- "Medinist" brand + bell + avatar at top (same as dashboard)
- Below: "Add Inventory" title on left, `Search` icon on right

**Add Product button:**
- Full-width, light gray (`bg-gray-100`) rounded pill button: "+ Add New Product"
- No action wired yet (placeholder for future)

**Medicine list:**
- Each item in a `rounded-2xl bg-gray-100` container with generous padding
- Left: `Pill` icon (lucide) in a small circle
- Middle: medicine `name` (bold) + `generic_name` below (smaller, gray)
- Right: taka bag icon + `price` in bold
- Sorted alphabetically by `name`

**Data fetching:**
- Use `useAuth()` to get `profile.pharmacy_id`
- Query `supabase.from("medicines").select("*").eq("pharmacy_id", pharmacyId).order("name")`
- Loading state: skeleton placeholders
- Empty state: centered message "No medicines added yet. Tap + to start."

**Bottom padding:** `pb-24` to clear bottom nav

### Technical Details
- Uses existing `supabase` client and `AuthContext`
- RLS policy already filters by pharmacy_id, but we also filter explicitly
- No database changes needed — `medicines` table already has all required columns

