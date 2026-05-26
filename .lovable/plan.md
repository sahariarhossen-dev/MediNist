# Fix: "Edge Function returned a non-2xx status code" on invitation accept

## Root cause

The edge function log shows `createUser error: Database error creating new user`. This happens because `auth.users` has a trigger `on_auth_user_created_subscription` that runs `handle_new_user_subscription()`, which inserts into `public.subscriptions` — a table that does not exist in the database. Every new auth user insert therefore fails, blocking the entire accept-invitation flow (and any other signup).

The trial countdown logic was already moved to the frontend (`useSubscription` derives the 30-day trial from `auth.users.created_at`), so this trigger/function is dead weight.

## Fix (single migration)

Drop the broken trigger and its function:

```sql
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_subscription();
```

The remaining `on_auth_user_created` → `handle_new_user()` trigger (which creates the `profiles` row) stays in place and works correctly.

## Verification

- After migration, retry the invitation link for `mehedi@gamil.com` → "Fahim Medical Hall". `accept-invitation` should: create the auth user, run `handle_new_user` (creates profile), sign in, run `accept_staff_invitation` (links to pharmacy with manager role), and return 200 with a session.
- Confirm no edge function code changes are needed — the function is correct; it was the DB trigger failing underneath it.

## Files

- New migration only. No app code changes.
