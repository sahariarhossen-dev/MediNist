# Messages List — Premium Refresh

Scope: `src/pages/Messages.tsx` + `src/components/messaging/InboxRow.tsx` only. No data model or backend changes.

## 1. Filter chips row (`Messages.tsx`)

Add a horizontally scrollable chip strip right under the search input.

- Chips: `All`, `Unread`, `Groups`, `Direct` (local `useState<'all'|'unread'|'groups'|'direct'>`).
- Container: `flex gap-2 overflow-x-auto no-scrollbar px-3 pb-2 bg-white border-b` with `-mx-1 px-3` safe padding so chips don't clip.
- Active chip: `bg-slate-900 text-white font-medium rounded-full text-xs px-3.5 py-1.5`.
- Inactive: `bg-slate-100 text-slate-600 hover:bg-slate-200/70 rounded-full text-xs px-3.5 py-1.5 transition-all`.
- Filtering happens after the existing query filter:
  - `unread` → `unread_count > 0`
  - `groups` → `type === 'group'`
  - `direct` → `type === 'direct'`

Tiny utility `no-scrollbar` already exists in `index.css`; if not, add it inline via `[&::-webkit-scrollbar]:hidden`.

## 2. Presence dots on avatars (`InboxRow.tsx`)

Pipe a presence map down from `Messages.tsx` via a new optional prop `presence?: 'online' | 'away' | null`.

- Source: existing `usePharmacyStaff()` hook (already returns `last_seen` per member).
  - `online`: `last_seen` within last 2 min.
  - `away`: `last_seen` within last 10 min.
  - else: no dot.
- In `Messages.tsx`, build a `Map<user_id, status>` from `usePharmacyStaff` and pass `presence={room.other_user_id ? map.get(room.other_user_id) : null}` (groups get no dot).
- Render dot as a sibling inside a `relative` wrapper around `<Avatar>`:
  - Base: `absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white`
  - Online: `bg-emerald-500` + subtle pulse: `after:absolute after:inset-0 after:rounded-full after:bg-emerald-500/60 after:animate-ping`
  - Away: `bg-amber-500`

## 3. Row typography, spacing & unread polish (`InboxRow.tsx`)

- Row container: `flex w-full items-center gap-3 py-3.5 px-4 hover:bg-slate-50/60 active:bg-slate-100/80 transition-colors cursor-pointer text-left`.
- Title: `truncate text-[15px] tracking-tight text-slate-900` + `font-semibold` when `unread_count > 0`, else `font-medium`.
- Snippet: `text-xs text-slate-400 font-normal mt-0.5 line-clamp-1`; switch to `text-slate-900 font-medium` when unread.
- Right column becomes a vertical stack (time on top, badge below):
  - Wrapper: `flex flex-col items-end gap-1 shrink-0`.
  - Time: `text-[11px] ${unread ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`.
  - Unread badge: `bg-emerald-500 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center`. For counts > 9 use min-w-[20px] px-1 so 2-digit numbers still fit; `99+` for >99.

## 4. Floating action button (`Messages.tsx`)

Replace the existing FAB classes with:

`fixed bottom-24 right-5 h-14 w-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-[0_8px_30px_rgb(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all duration-200`

Keep `MessageSquarePlus` icon and `aria-label="New chat"`.

## 5. Empty state

Update empty-state copy block to match new tone:
`No conversations match this filter.` when a filter is active, otherwise the existing "tap the green button" message.

## Technical notes

- No new dependencies, no schema changes.
- Presence map memoized with `useMemo` over `usePharmacyStaff().members` recalculated every minute via a lightweight `useEffect` + `setInterval(60_000)` ticker that bumps a counter to re-derive statuses (avoids stale dots).
- All Tailwind classes; no new CSS files.
- Mobile-first: chips wrap horizontally with overflow-x-auto so they remain swipeable; no desktop-specific layout.

## Files touched

- `src/pages/Messages.tsx` (filter chips, presence map, FAB classes, filter logic).
- `src/components/messaging/InboxRow.tsx` (avatar dot, row styles, stacked time/badge).