

## Plan: Fix Forgot Password Flow

### Analysis
The core flow is already implemented and mostly working (auth logs confirm recovery emails are being sent). The issues to fix are:

1. **Redirect URL**: Currently uses `window.location.origin` which is correct, but the published URL (`https://medi-nist.lovable.app`) must be added to Supabase's **Redirect URLs** allowlist in the Auth settings. This is the most likely reason the flow breaks in production.

2. **Missing "Confirm Password" field**: The ResetPassword page only has one password field — needs a confirmation field with match validation.

3. **Better feedback messages**: Add spam folder mention, improve error display.

### Important Note on "User not found"
Supabase intentionally does NOT reveal whether an email exists in the system (security best practice to prevent email enumeration). The API returns success even for non-existent emails. We'll show a generic success message instead.

### SMTP Reminder
Supabase's built-in email provider has a limit of ~4 emails/hour in development. For production, you should configure a custom SMTP provider (like Resend, SendGrid, or your own SMTP) in **Supabase Dashboard → Authentication → Email Templates → SMTP Settings**. This is likely why some users aren't receiving emails.

---

### Changes

**File 1: `src/pages/ForgotPassword.tsx`**
- Update success message to mention checking spam/junk folder
- Use the published URL (`https://medi-nist.lovable.app/reset-password`) as `redirectTo` so it works reliably in production

**File 2: `src/pages/ResetPassword.tsx`**
- Add "Confirm Password" field with show/hide toggle
- Add password match validation (disable submit if passwords don't match, show mismatch error)
- Keep existing password strength meter

**Manual step (user action required):**
- Go to **Supabase Dashboard → Authentication → URL Configuration** and add `https://medi-nist.lovable.app/reset-password` to the **Redirect URLs** allowlist. Without this, Supabase will block the redirect after the user clicks the email link.

### No database changes needed

