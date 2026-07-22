Add a legally compliant Terms of Service and Privacy Policy agreement step to the registration wizard, enforce it before account creation, and persist a timestamped audit record in the user's profile.

## What will change

### 1. Database — `profiles` table
- Add `terms_accepted` boolean column.
- Add `terms_accepted_at` timestamp with time zone column.
- Follow the required public-schema GRANT order: CREATE/ALTER, GRANTs, ENABLE RLS, policies already exist.

### 2. Frontend — `src/pages/Register.tsx` Step 4 (Review)
- Add `termsAccepted` boolean state.
- Add a checkbox above the Confirm button with the label:
  "I have read and agree to the Terms of Service and Privacy Policy."
- Make "Terms of Service" and "Privacy Policy" clickable links to `/terms` and `/privacy` that open in a new tab.
- Disable the "Confirm & Create Account" button until the checkbox is checked.
- If the user clicks the button without checking, show a toast notification asking them to agree.
- Pass `terms_accepted: true` to the `register-pharmacy` edge function on submit.
- Use the existing shadcn `Checkbox` component and keep the current blue brand styling and spacing.

### 3. Edge function — `supabase/functions/register-pharmacy/index.ts`
- Accept `terms_accepted` in the request body.
- When updating the profile after user creation, also set:
  - `terms_accepted: true`
  - `terms_accepted_at: now()` (ISO timestamp)
- Maintain existing validation and rollback logic.

### 4. Verification
- Deploy the updated edge function.
- Verify in the UI that the checkbox appears, links work, and the button is disabled until checked.
- Verify the database stores `terms_accepted` and `terms_accepted_at` for a newly registered profile.

## Technical details

- Uses the existing shadcn `Checkbox` component.
- No new dependencies required.
- RLS policies on `profiles` already allow users to manage their own row; the edge function uses the service-role client, so the new columns are written without policy changes.
- Migration will include `GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;` and `GRANT ALL ON public.profiles TO service_role;` to match existing access patterns.

## Acceptance criteria

- [ ] Step 4 shows the checkbox with the exact requested text.
- [ ] Clicking the Terms/Privacy links opens `/terms` and `/privacy` in a new tab.
- [ ] "Confirm & Create Account" is disabled until the box is checked.
- [ ] Clicking the disabled button shows a toast asking for agreement.
- [ ] New profiles contain `terms_accepted: true` and `terms_accepted_at` populated after signup.
- [ ] The change does not break existing registration behavior.