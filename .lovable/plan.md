# Fix: false "Subscription expired" lockout right after login

## Root cause (verified in code + live data)

The lockout is not a loading-state bug — it is a **bad fallback value** that is computed whenever a subscription read comes back empty.

In `src/hooks/useSubscription.ts`, every failure path (no `pharmacy_id` on the profile yet, empty `pharmacies` row, thrown error) calls `buildDefaultTrialSub(createdAt)`, which fabricates a subscription of **account creation date + 30 days**.

For this account the auth user was created `2026-05-24`, so the fabricated expiry is `2026-06-23` — over two months in the past. `getStatus()` in `src/lib/subscriptionStatus.ts` then returns `"expired"`, and `AppLayout` immediately renders `SubscriptionExpiredOverlay`, even though the real `pharmacies.subscription_expiry` is `2026-09-10`.

Why it happens right after a password login and then heals itself:

1. On the first render after login the Supabase client has a session, but the profile/pharmacy chain is still in flight; any request that returns empty or errors (auth header not yet attached, RLS returning zero rows, a transient network failure) drops into the fake-trial fallback.
2. That fallback is an *expired* subscription for any account older than 30 days, so the overlay paints.
3. A moment later realtime/refetch (or the `Subscription` page mounting its own copy of the hook) returns the real row, status flips to `active`, and the overlay disappears.

Two aggravating factors confirmed in the code:

- `AppLayout` reads `isExpired` without waiting for `loading` to settle, so any intermediate wrong value is rendered instantly.
- `useSubscription` is local state duplicated per consumer (`AppLayout` and `Subscription.tsx` each hold their own copy and each run their own fetch), so races repeat on every navigation and the two copies can disagree.

Note: `getStatus(null, [])` returns `"trial"`, so a plain null state does not lock the user out. The lockout comes strictly from the expired-by-construction fallback.

## The fix

1. **Never fabricate an expired subscription.** `useSubscription` distinguishes three outcomes: `resolved` (real pharmacy row), `unresolved` (query returned nothing / errored), `no-pharmacy` (genuinely no pharmacy linked). Only a real row produces an `expired` verdict. `getStatus` gains an `"unknown"` state used while unresolved.
2. **Gate the lockout on settled, trusted data.** `AppLayout` renders `SubscriptionExpiredOverlay` only when `loading === false` **and** the status came from a real `pharmacies` row. Until then, nothing blocking is shown (the app stays usable; no full-screen spinner regression).
3. **Wait for the auth token, then retry transient emptiness.** The hook subscribes to `AuthContext`'s user/session instead of calling `supabase.auth.getUser()` on its own render, and refetches when the session changes (`SIGNED_IN`, `TOKEN_REFRESHED`). If the profile or pharmacy read comes back empty while a session exists, it retries with a short backoff (e.g. 2 attempts, ~400ms/1200ms) before concluding anything.
4. **One shared source of truth.** Wrap the hook in a `SubscriptionProvider` context so `AppLayout` and `Subscription.tsx` share a single fetch and a single verdict, removing duplicate requests and disagreeing copies.
5. **Trial handling stays intact.** Genuine free-trial accounts (a real pharmacy row without `subscription_expiry`) keep the created_at + 30 days trial calculation; the fabricated trial is only removed from the *unknown/error* path.

Behaviour after the fix: on login the user sees the app normally; the renew overlay appears only when the server has actually confirmed an expired subscription.

## Also included

- `src/pages/Workspace.tsx` currently fails to build: the `mark_room_read` RPC parameter is `_room_id`, not `p_room_id`. This one-line correction ships with the fix.

## Technical notes

- Files touched: `src/hooks/useSubscription.ts`, `src/lib/subscriptionStatus.ts`, `src/components/AppLayout.tsx`, `src/pages/Subscription.tsx`, a new `src/contexts/SubscriptionContext.tsx`, and the `Workspace.tsx` RPC arg.
- No database, RLS, or edge-function changes are needed — the data is correct server-side; only the client's fallback logic is wrong.
- Realtime subscriptions on `pharmacies` / `subscription_payments` are preserved, moving into the provider so only one channel is opened.
- Verification: log in fresh and confirm no overlay flash, confirm the Subscription page shows "Active — renewing Sep 10, 2026", and simulate an empty pharmacy read to confirm the app no longer locks.
