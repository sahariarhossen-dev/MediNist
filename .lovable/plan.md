# Fix: First Registrant Must Be Admin + Staff Management Guards

## Root cause

The `register-pharmacy` edge function already attempts to set `role: "admin"` on the profile after signup, but the flow is fragile:

1. `handle_new_user` trigger inserts the profile with the default `role = 'salesman'` the moment `auth.admin.createUser()` runs.
2. The edge function then issues a separate `.update({ role: "admin" })`.
3. If that update fails for any reason, the code only `console.error`s it and still returns success — leaving the brand-new pharmacy owner stuck as `salesman`. There is no rollback and no verification.
4. The auto sign-in step uses the **admin client** (`supabaseAdmin.auth.signInWithPassword`) which is unusual and can produce sessions tied to the service role context.

We will make the role assignment atomic, verified, and fail-loud, and lock down staff-management UI to admins only.

## Plan

### 1. Make the registering user an Admin atomically (backend)

Edit `supabase/functions/register-pharmacy/index.ts`:

- After creating the auth user, replace the silent `.update()` with a verified update:
  - Run the update with `.select("id, role").single()`.
  - If `role !== "admin"` or there is any error, roll back: delete the auth user (`supabaseAdmin.auth.admin.deleteUser`) and the pharmacy row, then return an error response.
- Use a **separate non-admin client** (anon key) for the auto sign-in, not the service-role client, so the returned session is a normal user session.

### 2. Harden the profile default (database migration)

Add a small migration to make the system robust even if a future signup path forgets to set the role:

- Keep `handle_new_user` creating the profile, but change the default insert to `role = NULL` (or leave 'salesman' — see Technical Notes). This isn't strictly required for the bug fix; the edge function is the source of truth. We will keep `'salesman'` as default to avoid breaking the staff-invitation flow, which relies on it.
- No schema changes needed beyond what's already there. `accept_staff_invitation` already sets the invited user's role correctly to `admin/manager/salesman` from the invitation.

(So: no migration required — fixing the edge function is sufficient. Listed here for completeness.)

### 3. Guard staff management in the UI (frontend)

In `src/pages/ShopProfile.tsx` (the screen that lists and invites staff):

- Read `profile.role` from `useAuth()`.
- If `role !== 'admin'`, hide the "Invite staff", "Remove", and "Revoke" controls and the staff list section, showing a small "Admin only" notice instead.
- Keep RLS as the real enforcement layer — these guards are UX only. Database RLS on `shop_staff` and the `invite-staff` edge function already restrict writes to admins via `is_pharmacy_admin()`.

### 4. Verify

- Manually sign up a new pharmacy and confirm `profiles.role = 'admin'` for that user.
- Sign in as a non-admin and confirm the staff management UI is hidden.
- Confirm an existing admin can still invite staff and that invited users land with the role from the invitation (admin/manager/salesman) via `accept_staff_invitation`.

## Technical notes

- The reported "salesman" outcome happens because the post-signup `.update` either failed silently or never ran (e.g., transient error, network blip). Making it fail-loud + rolling back guarantees only admin-promoted accounts persist.
- We do not need a new RPC: the service-role client bypasses RLS, and there are currently no triggers attached to `public.profiles` that would block the role change (the `prevent_role_change` function exists but is not bound to any trigger).
- The `invite-staff` and `accept_staff_invitation` paths already correctly assign admin/manager/salesman roles to invitees, so they don't need changes.

## Files touched

- `supabase/functions/register-pharmacy/index.ts` — verified update + rollback, switch auto sign-in to anon client.
- `src/pages/ShopProfile.tsx` — admin-only guards around staff UI.
