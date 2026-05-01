# Messaging Polish: Navigation, Avatars, Identity Sheets

## 1. Fix back-button navigation loop

**Problem**: `Messages` page is rendered inside `AppHeader` (a root-tab style header) AND has its own back button calling `navigate(-1)`. Combined with the root-tab `useRootBackHandler` sentinel pushed on `/` `/sales` `/ai` `/more`, history can loop. The chat room also uses `navigate("/messages")` which is correct, but inbox `navigate(-1)` may bounce.

**Fixes**:
- `src/pages/Messages.tsx`: back arrow → `navigate("/")` (definitive Dashboard target). Also remove the duplicated `<AppHeader />` above the page header so the inbox shows a single clean header (back + title) like WhatsApp.
- `src/pages/ChatRoom.tsx`: keep `navigate("/messages")` but use `{ replace: false }` and guard against landing back on chat — already correct. No change needed beyond confirming.
- No change to `useRootBackHandler` (it only runs on `/ /sales /ai /more`).

## 2. Dynamic profile & group avatars (already partially wired)

Avatars already pull `avatar_url` from `profiles` via `get_chat_inbox` and `useChatRoom`. Confirmed working. To guarantee live sync:

- `useChatRoom.ts`: when receiving INSERT realtime, also re-fetch member profile snapshots if a new sender appears (covers avatar updates mid-session).
- `InboxRow.tsx` / `ChatRoom.tsx` header: when `room.type === "group"` and no `avatar_url`, render a stylized circular gradient with the `Users` icon (already uses `Users` icon in fallback — upgrade styling to a green-gradient circle to match WhatsApp).

## 3. WhatsApp-style "View Identity" feature

### New component: `src/components/messaging/ProfileSheet.tsx`
A bottom `Sheet` showing a member's identity:
- Large avatar (avatar_url with fallback initials)
- Full name
- Designation (role: Owner/Manager/Salesman — humanized from `profiles.role`)
- Member ID (short of `profiles.id`, e.g. `#A1B2C3`)
- Phone (`profiles.phone`) with tap-to-call link
- Last seen (relative)

Triggered by tapping the avatar in `ChatRoom` header (direct chats only).

### New component: `src/components/messaging/GroupInfoSheet.tsx`
- Group avatar (editable for admins)
- Group name (editable inline for admins via pencil icon)
- Member list with avatars, names, roles, admin badges
- Tapping a member opens `ProfileSheet`
- Admin-only: change avatar → upload to `chat-attachments/groups/<roomId>.jpg` (public URL via signed URL or move to public bucket option below) and `update chat_rooms set avatar_url, name`
- "Leave group" button for non-admin (deletes own `chat_room_members` row)

Triggered by tapping the avatar/name in `ChatRoom` header for group rooms.

### Permissions
RLS already allows: `chat_rooms` UPDATE by creator or `is_pharmacy_admin()`. No DB changes required. Storage upload uses existing `chat-attachments` bucket; we'll add a small RLS policy if needed for the `groups/` prefix (insert/select for room members).

### DB / storage migration
- Add storage policies for `chat-attachments` so room members can read group avatars and admins can write under `groups/<room_id>/`:
  - SELECT: room member (via `is_room_member`) when path starts with `groups/<room_id>/`
  - INSERT/UPDATE: room admin or pharmacy admin
- (Optional, simpler) Use the public `pharmacy-assets` bucket for group icons under `groups/<room_id>/icon.jpg`. **Plan: use existing public `pharmacy-assets` bucket** to avoid signed-URL plumbing.

## 4. UI/UX polishing

`src/pages/ChatRoom.tsx` header:
- Wrap avatar + name in a single tappable region that opens the appropriate sheet
- Tighten alignment: `items-center`, consistent `gap-3`, avatar `h-10 w-10`
- Subtitle: keep "typing…" / "N members" / "last seen X" (already present; refine "Online" if `last_seen` is within 60s)

`src/pages/Messages.tsx`:
- Remove `<AppHeader />` (it's noise inside an inbox screen)
- Sticky single header with back arrow → Dashboard
- Search bar unchanged

## Files to change

```text
src/App.tsx                                    (no change)
src/pages/Messages.tsx                         (remove AppHeader, back→"/")
src/pages/ChatRoom.tsx                         (tappable header → open sheets, online logic)
src/components/messaging/InboxRow.tsx          (group icon styling)
src/components/messaging/ProfileSheet.tsx      NEW
src/components/messaging/GroupInfoSheet.tsx    NEW
src/hooks/useChatRoom.ts                       (refetch members when new sender appears)
supabase/migrations/<ts>_chat_group_assets.sql storage policy on pharmacy-assets for groups/
```

## Out of scope
- Adding/removing group members (can be a follow-up)
- Message reactions, replies, deletes from UI