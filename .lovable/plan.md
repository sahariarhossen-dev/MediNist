

## Plan: Individual User Profile Page with Dynamic Avatar

### Overview
Create a new `/profile` page with avatar upload, user identity card, monthly target progress, and a personal 7-day sales mini-chart. The header avatar across all pages becomes a clickable link to this profile page, showing the uploaded photo when available.

### Database Changes

**1. Add `avatar_url` column to `profiles` table** via migration:
```sql
ALTER TABLE public.profiles ADD COLUMN avatar_url text;
```

**2. Create a storage bucket** for avatar uploads:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
```

### Code Changes

**Step 1: Update AuthContext** (`src/contexts/AuthContext.tsx`)
- Add `avatar_url` to the `Profile` interface and fetch it alongside other profile fields.
- Add a `refreshProfile()` method so the profile page can trigger a re-fetch after avatar upload, instantly updating the header.

**Step 2: Create `/profile` page** (`src/pages/Profile.tsx`)
- **Header**: Back arrow navigating to `/` (dashboard) with `replace: true`. Title "My Profile".
- **Avatar Upload Section**: Large circular avatar area (centered). Shows current photo or initials fallback. Camera icon overlay. On click, opens file picker. Uploads to Supabase Storage `avatars/{userId}/avatar.jpg`, updates `profiles.avatar_url`, calls `refreshProfile()`.
- **User Identity Card**: Full Name, Member ID (truncated UUID), Designation/Role from profile.
- **Monthly Target Circular Progress**: A circular SVG progress ring showing 80% achievement. Text: "Your Monthly Target: ৳5,00,000" and "Achievement: 80% (৳4,00,000)". (Static/demo values for now since there's no target table.)
- **7-Day Personal Sales Mini-Chart**: Reuse the AreaChart pattern from `SalesTrendChart` but filtered by `user_id = auth.uid()` for the last 7 days only. Compact height (~140px).

**Step 3: Update header avatars** across pages
- **`src/pages/Index.tsx`**: Replace the `Avatar` that currently calls `signOut` on click. Instead, wrap with `onClick={() => navigate("/profile")}`. Use `AvatarImage` with `profile.avatar_url` when available, fallback to initials.
- **`src/pages/More.tsx`**: Same treatment for the header avatar and the user info card avatar. Update the "Profile" menu item to navigate to `/profile`.

**Step 4: Add route** (`src/App.tsx`)
- Import `Profile` page.
- Add route: `<Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />` (no AppLayout/BottomNav since it has its own back button).

**Step 5: Navigation integrity**
- Profile page back button uses `navigate("/", { replace: true })` to go to dashboard with no loop.

### Technical Details

- Avatar upload uses `supabase.storage.from("avatars").upload()` with `upsert: true`.
- Public URL retrieved via `supabase.storage.from("avatars").getPublicUrl()`.
- Circular progress built with SVG `<circle>` elements (stroke-dasharray/dashoffset technique).
- Mini sales chart queries `sales` table filtered by current user's `user_id` for last 7 days, grouped by day.

