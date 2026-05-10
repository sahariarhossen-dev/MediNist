# Fix 404 on `/accept-invitation` (and all deep links) on Vercel

## Diagnosis

The route is **not missing**. Both pieces already exist:

- `src/App.tsx` registers `<Route path="/accept-invitation" element={<AcceptInvitation />} />`
- `src/pages/AcceptInvitation.tsx` is fully implemented: it reads `?token=...` from the URL, calls the `accept-invitation` edge function to validate the invite, and shows a "Create Account & Join" form (full name + password) that finalizes the staff account and signs them in.

The 404 happens because **Vercel is serving the site as static files**, not as a SPA. When a user clicks the invite link and lands directly on `https://medinist.com/accept-invitation`, Vercel looks for a physical file at that path, doesn't find one, and returns its default 404 — React Router never gets a chance to run.

(Lovable's own hosting handles this automatically, which is why it works on the `.lovable.app` preview but not on the Vercel-hosted custom domain.)

## Fix

Add a single `vercel.json` file at the project root that tells Vercel to fall back to `index.html` for any request that isn't a real static asset. Once GitHub syncs, Vercel will auto-redeploy and `/accept-invitation`, `/reset-password`, `/invoice/:id`, `/staff/:id`, etc. will all work on direct load and refresh.

### File to create: `vercel.json`

```json
{
  "rewrites": [
    { "source": "/((?!.*\\.).*)", "destination": "/index.html" }
  ]
}
```

The regex `/((?!.*\\.).*)` matches any path that does **not** contain a dot, so real assets like `/assets/index-abc.js`, `/favicon.ico`, `/manifest.json`, `/placeholder.svg` are still served as files — only app routes fall back to `index.html`.

## What this fixes (all in one shot)

- `/accept-invitation?token=...` — staff invitation links
- `/reset-password` — password reset emails
- `/invoice/:saleId`, `/staff/:userId`, `/messages/:roomId`, `/more/customers/:id`, `/more/notes/:id` — every dynamic and deep route
- Page refresh on any non-root route

## No other changes needed

- The page logic is already correct and does not need edits.
- Supabase redirect URLs are already configured for `https://medinist.com/**` (done earlier).
- No edge function changes.
- No GitHub action needed from me — the Lovable ↔ GitHub sync pushes the new file automatically, and Vercel auto-deploys from GitHub.

## Technical notes

- `vercel.json` `rewrites` (not `redirects`) preserve the URL in the browser, which is required so React Router can read `/accept-invitation` and the `?token=...` query string.
- The negative-lookahead pattern is the Vercel-recommended SPA fallback and will not interfere with API routes (there are none on Vercel — all backend calls go to Supabase).
