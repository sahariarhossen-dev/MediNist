

## Make Sign In Functional with Supabase Auth

### New Files

| File | Purpose |
|------|---------|
| `src/pages/Login.tsx` | Login page with email/password form, Supabase auth |
| `src/contexts/AuthContext.tsx` | Auth context provider with session persistence, profile fetching |

### Changes to Existing Files

**`src/App.tsx`**
- Add `/login` route
- Wrap routes with `AuthContext` provider
- Protect `/` route — redirect to `/login` if not authenticated
- Allow `/register` and `/login` as public routes

**`src/pages/Index.tsx`**
- Use auth context to display the logged-in user's pharmacy name instead of hardcoded "nasser madical hall"
- Show user initials in avatar from profile data

**`src/pages/Register.tsx`**
- Make the "Sign In" button link to `/login`

### Implementation Details

**AuthContext (`src/contexts/AuthContext.tsx`)**
- Uses `supabase.auth.onAuthStateChange` listener (set up BEFORE `getSession()`)
- On session detected, fetches profile from `profiles` table to get `pharmacy_id`, `full_name`, `role`
- If `pharmacy_id` exists, fetches pharmacy name from `pharmacies` table
- Exposes: `user`, `profile`, `pharmacyName`, `loading`, `signOut`

**Login Page (`src/pages/Login.tsx`)**
- Email and password fields
- Calls `supabase.auth.signInWithPassword({ email, password })`
- On error: shows "Invalid login credentials" message
- On success: redirects to `/`
- Loading state: button shows "Signing in..." with disabled state
- Link to `/register` for new users
- Styled consistently with Register page (blue Medinist branding, white card, mobile-first)

**Session Persistence**
- Supabase client already configured with `persistSession: true` and `autoRefreshToken: true`
- AuthContext checks session on mount; shows loading spinner until resolved
- Protected routes redirect to `/login` when no session

