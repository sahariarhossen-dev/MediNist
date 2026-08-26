# Remove Back Arrows from All Page Headers

## Goal
Strip every back-arrow button (`ArrowLeft` / `ChevronLeft` / `navigate(-1)` back buttons) from secondary page headers across the app, leaving clean, left-aligned titles under the global `AppHeader`.

## In Scope (back buttons in page/sub-headers)
Files confirmed to have header back buttons via `navigate(-1)`:
- `src/pages/StaffManagement.tsx`
- `src/pages/ShopProfile.tsx`
- `src/pages/Subscription.tsx`
- `src/pages/SubscriptionCheckout.tsx`
- `src/pages/Inventory.tsx` (Add Inventory header)
- `src/pages/AddProduct.tsx`
- `src/pages/CatalogSearch.tsx`
- `src/pages/PersonalReport.tsx`
- `src/pages/StaffPerformanceDetails.tsx`
- `src/pages/NoteEditor.tsx` (header back; keep the save-on-exit logic `handleBack`, just remove the arrow button)

Additional header-like usages to audit and clean (grep pass per file, remove only header back buttons):
- `Terms.tsx`, `Privacy.tsx`, `ForgotPassword.tsx`, `Messages.tsx`, `ChatRoom.tsx`, `Customers.tsx`, `CustomerProfile.tsx`, `CreateSale.tsx`, `AllTransactions.tsx`, `Profile.tsx`, `AddCompany.tsx`, `ShortItems.tsx`, `DailyTransactions.tsx`, `Blog.tsx`, `BlogPost.tsx`, `Register.tsx`, `src/components/notes/NotesMenu.tsx`

## Out of Scope (do NOT touch)
- shadcn UI primitives that use arrow icons for their own function: `src/components/ui/carousel.tsx`, `calendar.tsx`, `pagination.tsx`
- Non-header navigational logic (e.g., `navigate(-1)` used after an action completes, like `StaffPerformanceDetails` staff-not-found redirect) — only remove the UI button, keep functional redirects.
- NoteEditor's `handleBack` autosave logic — only remove the arrow button and route "close" behavior sensibly.

## Changes per file
1. Remove the back `<button>` element and any now-unused `ArrowLeft`/`ChevronLeft` imports.
2. Keep the header title and other header actions; ensure title stays left-aligned with consistent spacing (remove leftover `gap`/`ml` offsets that were compensating for the button).
3. In `NoteEditor.tsx`, replace header back button with nothing (title-only) and keep the existing save flow intact.

## Verification
- `rg` sweep confirms no remaining header back buttons (only ui primitives + functional redirects remain).
- `tsgo` typecheck passes.
- Visual spot-check via Playwright on `/inventory`, `/staff-management`, `/shop-profile`, `/subscription`, `/more/notes` headers.
