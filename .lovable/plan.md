## Fix AcceptInvitation stuck-loading bug

### Problem
The `/accept-invitation` route gets permanently stuck on a loading spinner because:
1. The initial fetch lacks a `finally` block — if an exception occurs, `setLoading(false)` never runs.
2. There's no timeout/AbortController, so cold-start edge function hangs leave the user waiting indefinitely.
3. No client-side token validation means malformed tokens trigger a fetch that may silently fail.
4. No handling for already-signed-in users with a different email causes confusion.
5. No retry button for transient network failures.

### Changes
1. **Robust fetch with try/catch/finally + AbortController + 15s timeout**
   - Extract fetch logic into a `fetchInvite` callback.
   - Wrap fetch in `try/catch/finally` so `setLoading(false)` always executes.
   - Add `AbortController` and a 15-second `setTimeout` abort for safety.
   - Wait for `authLoading` to resolve before starting the fetch.

2. **Client-side token validation**
   - Add a UUID regex helper (`isUuid`).
   - If token is missing or malformed, immediately show "Invitation not found" without calling the edge function.

3. **Already-signed-in user detection**
   - Import `useAuth` to read the current Supabase auth user.
   - After invite loads successfully, if `authUser.email !== invite.email`, render a dedicated card prompting the user to "Sign Out & Continue" (calls `signOut()` then reloads the page).

4. **Retry button on error card**
   - Add a "Try Again" button (with `RefreshCw` icon) on the error state UI.
   - Clicking it re-runs `fetchInvite` with a fresh AbortController/timeout.

5. **UI additions**
   - Import new icons: `LogOut`, `RefreshCw`.
   - Add retry and sign-out buttons with proper styling.

### Files changed
- `src/pages/AcceptInvitation.tsx`