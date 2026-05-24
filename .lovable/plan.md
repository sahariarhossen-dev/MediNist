# Fix "Edge Function returned a non-2xx status code" on Registration

## Root cause (confirmed from edge logs + DB inspection)

Edge function logs show every registration failing with:

```
Profile admin promotion failed: { code: "P0001", message: "Users cannot change their own role" }
```

The DB has **two** triggers calling `prevent_role_change()` on `public.profiles`:

1. `prevent_role_self_update` — correct: fires only `WHEN (new.id = auth.uid())`.
2. `profiles_prevent_role_change` — **buggy**: fires on every UPDATE of `role`, with no `auth.uid()` check.

The edge function uses the service-role client (where `auth.uid()` is NULL), but trigger #2 still throws, so the `update({ role: 'admin' })` always fails → rollback deletes the auth user and pharmacy → 500 returned to the client. Nothing wrong with foreign keys or with the TRUNCATE; the trigger was always broken, it just wasn't visible before.

## The fix

### 1. DB migration — remove the redundant role guard

Drop `profiles_prevent_role_change`. Keep `prevent_role_self_update`, which already correctly blocks a logged-in user from editing their own role while letting the service role (and the edge function) promote a new owner to `admin`.

```sql
DROP TRIGGER IF EXISTS profiles_prevent_role_change ON public.profiles;
```

This preserves the security intent (users still can't escalate their own role; the existing RLS UPDATE policy on `profiles` also blocks role changes by the user) while unblocking server-side promotion.

### 2. `src/pages/Register.tsx` — clear stale session + graceful errors

Before invoking `register-pharmacy`:

- Call `await supabase.auth.signOut().catch(() => {})` so any leftover JWT from a deleted user (the current console shows `user_not_found` 403s for sub `41f9a774…`) doesn't get attached to the function call.
- Wrap `supabase.functions.invoke(...)` so we surface the function's JSON `{ error }` body even when the SDK throws on non-2xx (currently the SDK error swallows it and the user only sees the generic "non-2xx" string). Use `try/catch` and read `err.context?.response`/`.text()` to extract the server message, falling back to a friendly default.

### 3. Edge function — small hardening only

`supabase/functions/register-pharmacy/index.ts` is already correct in shape (service-role client, verify-then-rollback). Once trigger #2 is gone the existing code works. No edits required beyond keeping the existing rollback path and the existing error log for future debugging.

## Files touched

- New migration: drop `profiles_prevent_role_change` trigger.
- `src/pages/Register.tsx`: pre-call `signOut`, improved error extraction + toast.
- No edge function code change needed.

## How to verify

1. Run the migration.
2. From the Register screen, complete all 4 steps and submit.
3. Expect: toast "Account created successfully!", redirect to `/dashboard`, and in the DB the new `profiles` row has `role = 'admin'` and `pharmacy_id` set.
4. Edge function logs should no longer contain "Users cannot change their own role".
