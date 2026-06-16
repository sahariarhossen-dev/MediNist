**Goal:** Surface invitation-fetch debugging info directly on the mobile screen so the user can inspect it without browser DevTools.

**Changes:**
1. In `src/pages/AcceptInvitation.tsx`, add a compact debug card below every rendered state (loading, error, and the main acceptance form) that displays:
   - `Token:` the raw token string from the URL query parameter.
   - `Error:` the current error state (or `null`).
   - `Invite:` whether the fetched invite object is `null` or present, plus its `email` and `status` when available.
2. Style the card with a monospace font, small text, neutral border, and a subtle background so it is clearly diagnostic but unobtrusive.
3. Keep all existing logic, loading states, error handling, retry button, and the acceptance form unchanged. The debug card is purely additive.