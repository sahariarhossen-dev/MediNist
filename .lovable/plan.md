

## Plan: Add Forgot Password Flow

### Overview
Add a "Forgot Password?" link to the login page, create a `/forgot-password` page to send reset emails, and create a `/reset-password` page that handles the recovery redirect and lets users set a new password.

### Changes

**1. `src/pages/Login.tsx` — Add "Forgot Password?" link**
- Between the password field and the Sign In button, add:
  ```
  <Link to="/forgot-password" className="text-sm text-gray-500 hover:text-blue-600 hover:underline">
    Forgot Password?
  </Link>
  ```
- Right-align it with `text-right` on its wrapper div.

**2. Create `src/pages/ForgotPassword.tsx`**
- Same visual style as Login (centered card, `bg-[#F4F6FB]`, rounded-xl white card).
- Email input + "Send Reset Link" button.
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`.
- On success, shows a green success message: "A password reset link has been sent to your email. Please check your inbox."
- Back link to `/login`.

**3. Create `src/pages/ResetPassword.tsx`**
- Public route that handles the `type=recovery` hash from Supabase's email link.
- On mount, listens for `PASSWORD_RECOVERY` event via `supabase.auth.onAuthStateChange`.
- Shows New Password input with Eye toggle and the same password strength meter from Profile.
- "Update Password" button calls `supabase.auth.updateUser({ password })`.
- On success, shows toast and redirects to `/` (dashboard).

**4. `src/App.tsx` — Add routes**
- Import `ForgotPassword` and `ResetPassword`.
- Add two public routes:
  - `/forgot-password` → `<PublicRoute><ForgotPassword /></PublicRoute>`
  - `/reset-password` → `<ResetPassword />` (NOT wrapped in PublicRoute since user gets auto-logged in by recovery token)

### Files Modified
- `src/pages/Login.tsx`
- `src/pages/ForgotPassword.tsx` (new)
- `src/pages/ResetPassword.tsx` (new)
- `src/App.tsx`

