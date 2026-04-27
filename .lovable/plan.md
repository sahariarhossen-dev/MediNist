# Professional Staff Invitation & RBAC System

Upgrade the existing staff invite flow into a proper token-based invitation system. The current `invite-staff` edge function relies on Supabase's generic "invite by email" and never links the new user to the pharmacy or role — invited users sign up but land in the app with no `pharmacy_id`. We'll fix that end-to-end.

## What changes for the user

- Owner/admin sends invite from **Shop Profile → Manage Staff** (UI already exists; we'll add Revoke + branded confirmation).
- Invitee receives a **branded MediNist email** with a secure link: `/accept-invitation?token=…`.
- Invitee opens the link, sees the **shop name + assigned role**, sets their **full name + password**, and is dropped straight into the dashboard — automatically linked to the correct pharmacy with the correct role.
- Pending invites list shows status (Pending / Accepted) with Revoke action.
- Users cannot self-assign to a pharmacy — enforced at the database level.

## Database changes (migration)

Reuse the existing `shop_staff` table (it already has `pharmacy_id`, `email`, `role`, `status`, `invited_by`) and extend it:

- Add `token uuid not null default gen_random_uuid() unique`
- Add `expires_at timestamptz not null default (now() + interval '7 days')`
- Add `accepted_at timestamptz`
- Tighten the `status` check to `'pending' | 'accepted' | 'revoked' | 'expired'`
- Index on `token` for fast lookup
- Update existing `pending` rows with fresh tokens

Add a **SECURITY DEFINER RPC** `accept_staff_invitation(_token uuid)` that:
1. Looks up the invitation by token (bypassing RLS so the just-signed-up user can read it).
2. Validates it belongs to `auth.users.email = auth.uid()`'s email, is `pending`, and not expired.
3. Updates `profiles` for `auth.uid()` with `pharmacy_id` and `role` from the invitation.
4. Marks `shop_staff` row as `accepted`, sets `user_id = auth.uid()` and `accepted_at = now()`.
5. Returns `{ pharmacy_id, role, pharmacy_name }`.

This is the **only** path that can set a non-null `pharmacy_id` on a profile after signup. The existing `prevent_pharmacy_id_change` trigger plus the `Users can insert their own profile` RLS policy (which already forces `pharmacy_id IS NULL` on insert) prevent any client-side bypass.

Add a public RPC `get_invitation_by_token(_token uuid)` (SECURITY DEFINER, returns shop name + role + email + expiry) so the acceptance page can show details before the user signs in.

## Edge function changes

**`invite-staff`** (rewrite):
- Validate caller is admin of a pharmacy (existing logic).
- Validate email + role (`manager`, `salesman`, `owner`).
- Upsert into `shop_staff` with a fresh `token` and `expires_at`. Reset status to `pending` if re-inviting.
- Send a **branded HTML email via Lovable Cloud's built-in email infrastructure** (uses `send-transactional-email`) with the link `https://<app-url>/accept-invitation?token=<token>`. Email content includes pharmacy name, assigned role, and 7-day expiry notice.
- Stop calling `supabase.auth.admin.inviteUserByEmail` — the new flow doesn't need it.

**`accept-invitation`** (new edge function):
- Public endpoint (no auth required for the lookup step).
- `GET ?token=…` → calls `get_invitation_by_token` and returns shop name, role, email, expiry status.
- `POST { token, fullName, password }` → 
  1. Calls `get_invitation_by_token`, validates not expired/accepted.
  2. Creates auth user with `supabase.auth.admin.createUser({ email: invitation.email, password, email_confirm: true })`.
  3. Updates `profiles.full_name` for the new user.
  4. Signs the user in via `signInWithPassword` to get a session.
  5. Calls `accept_staff_invitation(token)` using the new user's session — this sets `pharmacy_id` + `role`.
  6. Returns the session.

This server-side flow guarantees the email matches the invitation and the user can never end up linked to a different pharmacy.

## Email infrastructure (Lovable Cloud built-in)

- Set up email domain via the email setup dialog (one-time, prompts the user).
- Scaffold transactional emails (creates `send-transactional-email` + queue + unsubscribe).
- Create one branded React Email template `staff-invitation.tsx` with: MediNist header, "You've been invited to join **{pharmacyName}** on MediNist as **{role}**", CTA button → acceptance link, expiry notice, fallback plain link.
- `invite-staff` invokes `send-transactional-email` with template `staff-invitation`.

## Frontend changes

**`src/App.tsx`**:
- Add public route `/accept-invitation` (rendered without `ProtectedRoute`).

**`src/pages/AcceptInvitation.tsx` (new)**:
- Reads `?token=` from URL.
- On mount: calls `accept-invitation` GET to fetch shop name, role, email.
- States: loading → invalid token → expired → already accepted → ready-to-accept → submitting → success.
- Shows a card matching the Register page style: "You've been invited to join **{shopName}** as **{role}**" with the locked email field, plus inputs for **Full Name** and **Password** (with show/hide), and a "Create Account & Join" button.
- On submit: calls `accept-invitation` POST, sets the returned session via `supabase.auth.setSession`, navigates to `/`.

**`src/pages/ShopProfile.tsx` — Manage Staff section**:
- Keep the existing email + role + Send UI (already clean).
- Add a **Revoke** action on `pending` rows (updates `shop_staff.status = 'revoked'`).
- Show three status states with badges: **Pending** (amber), **Accepted** (emerald), **Revoked** (gray).
- For pending rows, show **"Resend invite"** button that re-calls `invite-staff` (regenerates token, resends email).
- Hide the "owner" option from the role dropdown (only admin/owner can invite, and we don't want owner-invites-owner footguns) — keep `manager` and `salesman` only, per the spec.
- Show a small "Invitation expires in 7 days" hint under the form.

## Security guarantees

1. **No self-elevation**: `profiles` RLS blocks users from setting their own `pharmacy_id` or `role` (existing policy + `prevent_pharmacy_id_change` + `prevent_role_change` triggers). The only path to populate these is `accept_staff_invitation`, which validates the token + email match.
2. **Token unguessable**: 128-bit UUIDs.
3. **Token single-use + expiring**: 7-day expiry, marked `accepted` on use.
4. **Email match enforced server-side**: invitation email must equal the authenticated user's email.
5. **Invite RLS**: only admins of the same pharmacy can list/create/revoke invites for their `pharmacy_id` (existing policies cover this).
6. **Edge function input validation**: zod-style checks on email, role, password, fullName, token format.

## Files touched

- **New migration**: extend `shop_staff` (token, expires_at, accepted_at, status check), add `accept_staff_invitation` + `get_invitation_by_token` RPCs.
- **New edge function**: `supabase/functions/accept-invitation/index.ts`.
- **Rewrite edge function**: `supabase/functions/invite-staff/index.ts`.
- **New email template**: `supabase/functions/_shared/transactional-email-templates/staff-invitation.tsx` + register in `registry.ts`.
- **New page**: `src/pages/AcceptInvitation.tsx`.
- **Edit**: `src/App.tsx` (public route), `src/pages/ShopProfile.tsx` (revoke + resend + status badges).

## What we'll need from you during implementation

When the email setup dialog appears, you'll be asked to choose your sender domain (e.g. `notify.medi-nist.lovable.app` works out of the box, or your custom domain). Everything else is automated.