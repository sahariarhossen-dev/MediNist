# Fix Invitation Error + Security Hardening

## What's actually broken

The "non-2xx" error from `accept-invitation` is **not** a SECURITY DEFINER or RLS issue. Edge function logs show the real error:

```
new row for relation "profiles" violates check constraint "profiles_role_check"
Failing row contains (..., manager, ...)
```

**Root cause:** `profiles.role` has `CHECK (role IN ('admin', 'staff'))`, but the invite UI lets admins pick `manager` / `salesman`. When `accept_staff_invitation` writes those values into `profiles.role`, Postgres rejects the row.

The other security-scan findings are real but separate from the edge-function error.

## Plan

### 1. Fix the role system (unblocks invitation acceptance)

Standardize on a real role taxonomy used by both `profiles` and `shop_staff`:

- Create enum `public.app_role` with values: `admin`, `manager`, `salesman`.
- Migrate existing `profiles.role`: keep `admin` as `admin`, map `staff` → `salesman`.
- Drop the old `profiles_role_check` constraint and convert `profiles.role` to the new enum (default `salesman`).
- Update `shop_staff.role` to the same enum (default `salesman`).
- Update the `profiles INSERT` RLS policy to allow `role IS NULL OR role = 'salesman'` (instead of `'staff'`).
- `is_pharmacy_admin()` keeps working (still checks `role = 'admin'`).

### 2. Tighten SECURITY DEFINER functions

Currently every SECURITY DEFINER function in `public` is executable by `anon` (the default `=X` ACL). Lock them down:

- `REVOKE EXECUTE ... FROM PUBLIC, anon` on: `accept_staff_invitation`, `get_invitation_by_token`, `is_pharmacy_admin`, `get_user_pharmacy_id`, `get_my_pharmacy_public`, `get_pharmacy_member_names`, `handle_new_user`, `recalc_customer_total_due`, `prevent_role_change`, `prevent_pharmacy_id_change`, `ai_messages_after_insert`, `rls_auto_enable`.
- `GRANT EXECUTE ... TO authenticated` only on the ones the app calls from the client / authed edge function: `accept_staff_invitation`, `get_invitation_by_token`, `is_pharmacy_admin`, `get_user_pharmacy_id`, `get_my_pharmacy_public`, `get_pharmacy_member_names`.
- The accept-invitation edge function already calls `get_invitation_by_token` and `accept_staff_invitation` via the service role / authenticated user, so this won't break it.

### 3. Harden `accept_staff_invitation` token validation

The function already validates pending status, expiration, and email match. Add one extra guard:

- Re-confirm `auth.uid()` is non-null and the auth user's email is verified before mutating profiles.
- Keep the `app.bypass_profile_guards` mechanism (it's the safe alternative to `session_replication_role`).

### 4. Let non-admin staff read their own pharmacy row

Add an additional SELECT policy on `pharmacies`:

```
CREATE POLICY "Members can view own pharmacy"
ON public.pharmacies FOR SELECT TO authenticated
USING (id = public.get_user_pharmacy_id());
```

The existing admin-only policy stays (admins still see everything they need; PostgreSQL ORs permissive policies).

### 5. Lock down Realtime on `notes`

`public.notes` is in the `supabase_realtime` publication, so any authenticated user can subscribe to its topic and receive change events from other pharmacies. Fix:

- Enable RLS on `realtime.messages` (Supabase-managed table; safe to add policies to).
- Add a policy that only allows subscribing to a topic of the form `pharmacy:<their pharmacy_id>`.
- Update the client (`useNotes` hook if it uses Realtime) to subscribe to `pharmacy:${pharmacy_id}` rather than the raw table channel. If the app does not currently use Realtime for notes, we'll simply remove `notes` from the `supabase_realtime` publication instead — that's the cleaner fix.

We'll inspect `useNotes.ts` during implementation and pick the right option (remove from publication vs. scoped channel).

### 6. Redeploy & verify

- Run a migration covering steps 1–5.
- Redeploy `accept-invitation` (no code change required, but redeploy to confirm clean state).
- Manually walk through: invite manager → open link → create account → confirm `profiles.role = 'manager'` and `shop_staff.status = 'accepted'`.

## Files to change

- New SQL migration (roles enum, RLS policy, function GRANTs, realtime fix)
- `supabase/functions/invite-staff/index.ts` — keep allowed roles `['admin','manager','salesman']` (already aligned, but verify after enum change)
- `supabase/functions/accept-invitation/index.ts` — minor: surface the underlying RPC error code for easier future debugging (optional)
- Possibly `src/hooks/useNotes.ts` — only if it uses a Realtime subscription that needs rescoping

## Why the previous "fix" didn't work

The last round addressed `session_replication_role` (a real issue) but the actual blocker was a check-constraint violation that only showed up *after* that fix let the RPC run. The logs make this unambiguous.
