

## 4-Step Registration Flow for Medinist

### Overview
Build a multi-step registration page at `/register` matching the PDF screenshots. Steps: Shop Name, Owner Info, Location, Review & Confirm.

### Database Changes (Migration)

**1. Add location columns to `pharmacies` table:**
```sql
ALTER TABLE pharmacies ADD COLUMN division text;
ALTER TABLE pharmacies ADD COLUMN district text;
ALTER TABLE pharmacies ADD COLUMN upazila text;
```

**2. Add phone column to `profiles` table:**
```sql
ALTER TABLE profiles ADD COLUMN phone text;
```

**3. Add RLS policies:**
- `pharmacies`: Allow anonymous SELECT (for name uniqueness check), allow authenticated INSERT for own pharmacy
- `profiles`: Allow authenticated users to INSERT/SELECT their own profile

**4. Create a database trigger** to auto-create a profile row on auth signup (standard pattern).

### New Files

| File | Purpose |
|------|---------|
| `src/pages/Register.tsx` | Main registration page with 4-step wizard |
| `src/data/bangladeshLocations.ts` | Static data for Division > District > Upazila cascading dropdowns |

### Registration Flow Details

**Step 1 — Shop Name**
- Input field for pharmacy name
- On blur/change, query `pharmacies` table to check uniqueness
- Show green "Shop name is available" or red error
- "Next" disabled until name is valid and available

**Step 2 — Owner Info**
- Fields: Full Name, Phone Number, Email, Password
- Client-side validation (email format, password min length, required fields)
- Back/Next buttons

**Step 3 — Location**
- Cascading dropdowns: Division → District → Upazila (Bangladesh data)
- Optional street address text input
- "Next" disabled until all 3 dropdowns selected

**Step 4 — Review**
- Summary table with Edit buttons that jump back to the relevant step
- "Confirm & Create Account" button

**On Confirm:**
1. Insert pharmacy record (name, address, division, district, upazila)
2. Sign up user via `supabase.auth.signUp({ email, password })`
3. Insert profile record (user id, pharmacy_id, full_name, phone, role: 'admin')
4. Auto-login and redirect to `/` (dashboard)

Note: Since signup + pharmacy creation involves multiple steps and we need the pharmacy ID before creating the profile, we'll use an edge function to handle this atomically, OR we'll use the signup flow where the trigger creates the profile and we update it afterward.

**Simpler approach chosen:** Use a Supabase database function (`handle_new_user`) triggered on auth signup that creates a basic profile. Then after signup succeeds, insert the pharmacy and update the profile with `pharmacy_id`. This avoids needing an edge function.

Actually, even simpler: Since RLS isn't fully set up yet, we'll:
1. Insert pharmacy (using service role via edge function OR with permissive insert policy)
2. Sign up user
3. Update profile with pharmacy_id

We'll use an **edge function** `register-pharmacy` that:
- Receives: shop name, full name, phone, email, password, location data
- Creates pharmacy record
- Creates auth user
- Creates profile with pharmacy_id and role='admin'
- Returns session

### Route Changes
- Add `/register` route in `App.tsx`
- Add "Sign In" link on register page (for future login page)

### Styling
- Clean white card centered on screen, matching the PDF screenshots
- Blue stepper at top showing 4 steps with numbers
- "Medinist" brand header in blue
- Mobile-first layout consistent with dashboard

### Technical Details
- Bangladesh location data: ~8 divisions, ~64 districts, ~495 upazilas embedded as static JSON
- Form state managed with React useState (single state object across steps)
- Edge function uses `SUPABASE_SERVICE_ROLE_KEY` (already in secrets) for admin operations

