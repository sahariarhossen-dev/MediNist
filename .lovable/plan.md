# Notification System (Facebook-style)

Build a clean, real-time notification center triggered from the header bell on every page.

## Data Source

Notifications will be **derived live from existing tables** (no new schema required) — this is faster, free of migration risk, and naturally real-time via Supabase subscriptions. Read/unread state is stored **per-user in localStorage** keyed by notification ID.

Four sources, all scoped to the user's pharmacy via existing RLS:

| Category | Table | Trigger |
|---|---|---|
| Inventory low-stock | `medicines` | `stock_quantity <= stock_alert` (and > 0) |
| Sales | `sales` | new row with `status = 'completed'` |
| Payments | `customer_ledger` | new row with `entry_type = 'payment'` |
| Manual dues | `customer_ledger` | new row with `entry_type = 'due'` AND `sale_id IS NULL` |

Each source contributes a unified `Notification` object: `{ id, category, title, message, createdAt, icon, link? }`. Limit to ~30 most-recent items combined.

## Files

**New**
- `src/hooks/useNotifications.ts` — fetches the four sources, merges/sorts, exposes `{ notifications, unreadCount, markAsRead, markAllAsRead, loading }`. Uses `localStorage` (`medinist:read-notifications`) to persist read IDs per user. Subscribes to `postgres_changes` on `sales`, `customer_ledger`, and `medicines` for the user's `pharmacy_id` so the bell updates in real-time.
- `src/components/notifications/NotificationBell.tsx` — bell icon + red badge with count (caps at "9+"). Adds a CSS `animate-jiggle` class for ~600 ms whenever `unreadCount` increases.
- `src/components/notifications/NotificationPanel.tsx` — Popover (Radix) anchored to the bell, width `w-[360px] max-w-[calc(100vw-24px)]`, header with "Notifications" title + "Mark all as read", `Tabs` (All / Unread), `ScrollArea` of items (max-height ~70vh).
- `src/components/notifications/NotificationItem.tsx` — avatar/icon circle, bold headline, message line, relative timestamp, blue dot for unread, light-blue bg when unread. Click → marks read and navigates to relevant page (Inventory / Sales / Customer profile).
- `src/lib/relativeTime.ts` — small "2 mins ago / 1 hour ago / 3d" formatter.

**Edited**
- `src/components/AppHeader.tsx` — replace the inline `<button><Bell/></button>` block with `<NotificationBell />`.
- `tailwind.config.ts` — add `jiggle` keyframes + `animate-jiggle` utility (rotate ±10° quick wobble).

## UI Details

- **Badge**: red `bg-red-500`, white text, `text-[10px] font-semibold`, `min-w-[18px] h-[18px]`, positioned `-top-0.5 -right-0.5`. Hidden when count is 0. Shows `9+` when > 9.
- **Panel header**: `Notifications` in `text-base font-semibold`; "Mark all as read" as a `text-blue-600 text-xs` button (disabled when no unread).
- **Tabs**: shadcn `Tabs` styled compact; "Unread" tab shows a small count chip.
- **Item**:
  - Unread → `bg-blue-50` + right-side `w-2 h-2 rounded-full bg-blue-500`.
  - Read → `bg-white`, no dot.
  - Hover → `bg-gray-50`.
  - Icon circle uses category color (Inventory = amber `Package`, Sales = green `ShoppingCart`, Payments = emerald `Wallet`, Dues = orange `AlertCircle`).
- **Scroll**: `ScrollArea` from existing `ui/scroll-area.tsx` (already minimalist).
- **Empty state**: centered `Bell` icon + "You're all caught up".
- **Mobile**: at 390 px viewport, panel width clamps to `calc(100vw - 24px)` and aligns right under the bell.

## Real-time Behavior

`useNotifications` opens a single Supabase channel per session, filtering by `pharmacy_id`. On any insert it re-runs the merge (cheap — at most 4 small queries) and triggers the bell jiggle if `unreadCount` increased. Marking as read updates local state immediately (no refetch).

## Out of scope

- No new database table or RLS policies.
- No push / browser notifications.
- No per-notification settings UI.

If later you want server-persisted read state (e.g. across devices), we can add a `notification_reads(user_id, notification_key)` table in a follow-up — the local approach is fully forward-compatible.
