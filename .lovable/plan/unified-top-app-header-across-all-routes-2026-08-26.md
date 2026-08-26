# Unified Top App Header Across All Routes

Today `AppHeader` (MediNist logo + bell + chat + avatar) is pasted manually into only 7 pages (Dashboard, Sales, More, Inventory, Customers, CustomerProfile, Daily/All Transactions). Inner pages like Smart Notes, Manage Staff, Shop Profile and Subscription have their own one-off headers and no branding row. This unifies the header into the layout so every in-app page looks the same.

## What changes for the user

- Every in-app page opens with the same MediNist top bar: brand on the left, notification bell, chat icon and profile avatar on the right.
- Pages that need back navigation (Manage Staff, Shop Profile, Subscription, Customer Profile, etc.) keep their `← Page Title` row, but it now sits as a secondary row directly under the global header.
- Smart Notes keeps its search bar — it moves directly below the global header instead of standing in for it.
- Bottom navigation behaviour is unchanged.

## Structure

```text
AppLayout
  DemoBanner / ReadOnlyBanner
  AppHeader              <- global, rendered once
  page content
     └ optional secondary row: [←] Page Title  (or Notes search bar)
  BottomNav
```

## Implementation

1. **`src/components/AppLayout.tsx`** — render `<AppHeader />` once, above `{children}`. Add an optional `showHeader` prop (default `true`) so full-screen flows can opt out.
2. **`src/App.tsx`** — wrap the remaining protected routes in `AppLayout` so they inherit the header: `/inventory`, `/add-product`, `/add-company`, `/short-items`, `/catalog-search`, `/profile`, `/shop-profile`, `/staff-management`, `/staff/:userId`, `/more/daily-transactions`, `/more/all-transactions`, `/personal-report`, `/more/customers`, `/more/customers/:id`, `/more/notes`, `/messages`.
   Opt out (`showHeader={false}`, no bottom nav — these are focused, keyboard-heavy flows): `/create-sale`, `/invoice/:saleId`, `/more/notes/:id` (note editor), `/messages/:roomId` (chat room). Public routes (landing, blog, auth) are untouched.
3. **Remove the per-page `<AppHeader />`** usages and imports from `Index.tsx`, `Sales.tsx`, `More.tsx`, `Inventory.tsx`, `Customers.tsx`, `CustomerProfile.tsx`, `DailyTransactions.tsx`, `AllTransactions.tsx` so it is not duplicated.
4. **Secondary rows** — in `StaffManagement.tsx`, `ShopProfile.tsx`, `Subscription.tsx`, `SubscriptionCheckout.tsx`, `CustomerProfile.tsx`, `PersonalReport.tsx`, `StaffPerformanceDetails.tsx` and similar: keep the existing `←` + title row, drop any `min-h-screen`/top-padding that assumed it was the first element, and align it to the shared page padding (`px-page`) so it reads as a sub-header. Sticky sub-headers get `top-0` removed or reduced so they don't overlap the global header.
5. **`Notes.tsx`** — keep the sticky search header but render it below the global header (remove its role as the page's top bar; keep backdrop blur and padding tuned to sit flush).
6. Verify with a typecheck and a quick pass over `/more/notes`, `/staff-management`, `/shop-profile` and `/subscription` in the preview at mobile width.

## Notes

- Visual-only refactor: no data, RPC, or permission logic is touched.
- Routes newly wrapped in `AppLayout` also gain the bottom nav and the subscription-expiry overlay, which is the intended consistent shell.
