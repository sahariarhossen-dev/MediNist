

## Plan: Shop Profile Page with Staff Management

### Overview
Create a new `/shop-profile` page with shop info editing, staff invite system, staff list, and billing customization. Requires 2 new database tables, a new edge function for invitations, and a new page component.

### Database Migrations

**Migration 1 — Add columns to `pharmacies` table + create `shop_staff` table:**

```sql
-- Add new columns to pharmacies
ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS drug_license text,
  ADD COLUMN IF NOT EXISTS trade_license text,
  ADD COLUMN IF NOT EXISTS invoice_footer text;

-- Create shop_staff table
CREATE TABLE shop_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'salesman',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(pharmacy_id, email)
);

ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff accessible by pharmacy members"
  ON shop_staff FOR ALL TO authenticated
  USING (pharmacy_id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));
```

**Migration 2 — Add UPDATE policy to pharmacies:**

```sql
CREATE POLICY "Pharmacy admins can update their pharmacy"
  ON pharmacies FOR UPDATE TO authenticated
  USING (id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));
```

### Storage

Create a `pharmacy-assets` public bucket for logo and cover images.

### Edge Function: `invite-staff`

New edge function at `supabase/functions/invite-staff/index.ts`:
- Accepts `{ email, role }` in request body
- Validates the caller is an admin (checks `profiles.role = 'admin'`)
- Uses `supabase.auth.admin.inviteUserByEmail()` to send invitation
- Inserts a row into `shop_staff` with status `pending`
- Returns success/error

### New Page: `src/pages/ShopProfile.tsx`

**Structure:**

1. **Header** — Back arrow + "Shop Profile" title

2. **Cover & Logo Section**
   - Cover image banner (uploadable, 200px height)
   - Logo overlay (rounded, uploadable, positioned bottom-left of cover)

3. **Shop Info Card** (`rounded-3xl`, emerald accents)
   - Editable fields: Pharmacy Name, Drug License, Trade License, Full Address
   - Edit/Save toggle with pencil/check icons
   - Updates `pharmacies` table

4. **Staff Management Card**
   - "Manage Staff" heading
   - Email input + role dropdown (Manager/Salesman) + "Send Invitation" button
   - Calls `invite-staff` edge function on click
   - Staff list below: fetches from `shop_staff` table
   - Each row: Email, Role badge, Status badge (Active/Pending), Trash icon to remove

5. **Billing Customization Card**
   - Textarea for "Invoice Footer Note"
   - Save button, updates `pharmacies.invoice_footer`

6. Mobile responsive, white background, emerald-600 accents

### Route Registration

Add to `App.tsx`:
```
<Route path="/shop-profile" element={<ProtectedRoute><ShopProfile /></ProtectedRoute>} />
```

Add navigation link in `More.tsx` menu items.

### Files Modified/Created
- `supabase/migrations/` — 2 migration files (pharmacies columns + shop_staff table)
- `supabase/functions/invite-staff/index.ts` — new edge function
- `src/pages/ShopProfile.tsx` — new page
- `src/App.tsx` — add route
- `src/pages/More.tsx` — add menu item

### Technical Details
- Image uploads use Supabase Storage (`pharmacy-assets` bucket)
- Staff invitation uses `auth.admin.inviteUserByEmail()` via service role in edge function
- Only users with `role = 'admin'` in profiles can invite staff or edit shop info
- The edge function validates admin status server-side before sending invitations

