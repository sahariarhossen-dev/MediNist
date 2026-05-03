# Notification System Overhaul

## 1. Scroll/Freeze Fix (`NotificationPanel.tsx`)

The current `ScrollArea` uses `max-h-[60vh]` but is wrapped inside a Radix Popover which can intercept wheel/touch events on certain mobile browsers, causing the "frozen" feel. Fix:

- Replace `ScrollArea` with a plain `div` using `max-h-[70vh] overflow-y-auto overscroll-contain` so native scrolling works reliably on mobile.
- Add `onWheel`/`onTouchMove` `stopPropagation` on the scroll container to prevent Popover from swallowing gestures.
- Make the panel width responsive: `w-[min(360px,calc(100vw-24px))]` (already close, just confirm).

## 2. Restrict Notification Sources (`useNotifications.ts`)

Remove all current sources (low-stock, completed sales, payments-received, generic ledger). Replace with **only** these three:

### A. New Customer Due
- Query `customer_ledger` where `entry_type = 'due'` AND `sale_id IS NOT NULL` (i.e., due created by completing a sale with outstanding amount). Also include manual dues if desired — spec says "transaction completed where Due Amount is recorded", so filter to `sale_id IS NOT NULL`.
- Join customer name.
- Title: `New Due Recorded`
- Message: `{customerName} - ৳{amount} TK`
- Link: `/more/customers/{customer_id}`
- id: `due:{ledger.id}`

### B. Public Note Shared
- Query `notes` where `is_public = true`, ordered by `updated_at desc`.
- Join creator full_name from `get_pharmacy_member_names` rpc.
- Title: `Note Shared`
- Message: `{userName} published a new note: {title || "Untitled"}`
- Link: `/notes` (or `/notes/{id}` if route exists — check and fall back).
- id: `note:{note.id}`
- Category: reuse `payment` icon slot or add new `note` category.

### C. Internal Broadcast
- Query `pharmacy_broadcasts` where `is_active = true`, recent.
- Title: `Shop Broadcast`
- Message: broadcast.message (truncated in UI via existing line-clamp).
- Link: `/` (home, where BroadcastBanner shows) or none.
- id: `bcast:{id}`

Add a new `NotificationCategory` value `note` and `broadcast` in `NotificationItem.tsx` ICON_MAP (e.g., `FileText` for note, `Megaphone` for broadcast). Keep existing `due` icon for dues.

## 3. Realtime Sync

Update the Supabase realtime channel subscription in `useNotifications.ts`:
- Subscribe to INSERT on `customer_ledger` filtered by `pharmacy_id` (already there) — keep.
- Subscribe to INSERT/UPDATE on `notes` filtered by `pharmacy_id` — new.
- Subscribe to INSERT/UPDATE on `pharmacy_broadcasts` filtered by `pharmacy_id` — new.
- Remove `sales` and `medicines` subscriptions.

Each event refetches via `fetchAll()`. Read-state uses existing localStorage `markAsRead` flow — no DB changes needed.

## 4. Click Behavior
Already handled in `NotificationItem.tsx`: clicking calls `onRead(id)` (marks read in localStorage) then navigates via `notification.link`. Confirm `/more/customers/{id}` route works (it does, line 89 of App.tsx).

## Files to Edit
- `src/hooks/useNotifications.ts` — replace fetch logic and realtime subscriptions
- `src/components/notifications/NotificationPanel.tsx` — fix scroll container
- `src/components/notifications/NotificationItem.tsx` — add `note` and `broadcast` categories to icon map
- Type update: `NotificationCategory = "due" | "note" | "broadcast"`

## Out of Scope
- No DB migrations needed (all tables and RLS already exist).
- No edge function changes.
