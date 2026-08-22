# Targeted Internal Broadcasts

Broadcasts today are pharmacy-wide: one active notice, visible to every member. This adds audience targeting (all / role / specific person) plus an urgent flag, enforced in the database and reflected everywhere broadcasts are read.

## 1. Database

Migration on `public.pharmacy_broadcasts`:

- `target_type text not null default 'all'` with a validation constraint allowing `all | role | user`
- `target_value text null` — role name (`admin`, `manager`, `salesman`) when `target_type='role'`, user id when `target_type='user'`, null for `all`
- `is_urgent boolean not null default false`
- A trigger validating the pairing: `all` requires null value, `role`/`user` require a non-empty value.

Existing rows keep `target_type='all'` via the default, so no notice is lost and they display as "All Staff".

Replace the SELECT policy `Members can view pharmacy broadcasts` so a member only sees rows in their pharmacy where one of these holds:

- `target_type = 'all'`
- `target_type = 'role'` and the value matches the viewer's `profiles.role`
- `target_type = 'user'` and the value equals `auth.uid()`
- the viewer is a pharmacy admin (admins always see everything they posted so the management UI can list all active notices)

Admin insert/update/delete policies stay as they are.

## 2. Multiple active notices

Targeting only makes sense if a role notice and a person notice can coexist, so posting no longer deactivates every other active notice. Instead:

- Posting creates a new active broadcast for the chosen audience.
- The Team tab lists all active broadcasts, each with its own Clear action.
- Editing is dropped in favour of Clear + Post (simpler than reconciling per-audience edits).

## 3. UI — Internal Broadcast card (`/staff-management`)

Same yellow card aesthetic. Inside it:

- "Send To" selector below the textarea: All Staff (default), Salesmen Only, Managers Only, Specific Person.
- Choosing Specific Person reveals a searchable staff picker (command-style list filtered by name, sourced from the already-loaded staff overview, suspended members excluded).
- An "Urgent" toggle sitting next to the Post button.
- Below the composer, a list of active broadcasts, each showing the message plus badges: audience (`To: All Staff`, `To: Salesmen`, `To: Salman F`) and a red `Urgent` badge when set, with a Clear button per row.

## 4. Reader surfaces

- `src/components/BroadcastBanner.tsx`: fetch all active broadcasts for the pharmacy (RLS already narrows to the viewer's audience), show the newest, order urgent ones first, and style urgent ones in red rather than amber. Dismissal stays per-broadcast-id in localStorage.
- `src/hooks/useNotifications.ts`: broadcast notifications inherit the same RLS filtering automatically; the notification title becomes "Urgent Notice" for urgent rows.

## Technical notes

- `pharmacy_broadcasts` is not in the generated Supabase types, so client calls keep the existing `as any` casts.
- Role values come from `profiles.role` (`admin` / `manager` / `salesman`); the UI labels use the existing `inviteRoleLabel` helper in `src/lib/staffRoles.ts`.
- Verification: as owner, post one notice per audience type and confirm the badges; then confirm a salesman sees the all-staff and salesmen notices but not the manager-only or another person's notice.
