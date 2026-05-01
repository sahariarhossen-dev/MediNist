# Real-time Messaging System (WhatsApp-style)

Add a staff chat system to MediNist with 1-on-1 and group conversations, scoped per pharmacy, with Supabase Realtime sync.

## 1. Database (Supabase migration)

Three new tables, all scoped by `pharmacy_id` with RLS using existing `get_user_pharmacy_id()` and `is_pharmacy_admin()` helpers.

**`chat_rooms`** — one row per conversation
- `id uuid pk`, `pharmacy_id uuid not null`
- `type text not null check in ('direct','group')`
- `name text` (group name; null for direct)
- `avatar_url text`
- `created_by uuid not null`, `created_at`, `updated_at` (touched by trigger when last message changes)

**`chat_room_members`** — membership
- `room_id uuid`, `user_id uuid`, `joined_at`, `last_read_at timestamptz` (drives unread count)
- `is_admin boolean default false`
- PK `(room_id, user_id)`

**`chat_messages`**
- `id uuid pk`, `room_id uuid`, `sender_id uuid`, `pharmacy_id uuid`
- `content text`, `attachment_url text` (nullable), `attachment_type text`
- `created_at timestamptz`

**RLS**
- `chat_rooms`: SELECT/INSERT requires `pharmacy_id = get_user_pharmacy_id()`. Only members can SELECT (via subquery on `chat_room_members`). Only admins or `created_by` can UPDATE/DELETE.
- `chat_room_members`: members can SELECT their own rows + rows of rooms they belong to. INSERT: room creator (direct) or pharmacy admin (group).
- `chat_messages`: SELECT if user is a member of `room_id`. INSERT if `sender_id = auth.uid()` AND user is member. UPDATE/DELETE only by sender within 5 min, or admin.

**Helper RPC**
- `get_or_create_direct_room(_other_user uuid) returns uuid` — finds or creates a direct room between current user and `_other_user` (both in same pharmacy), inserts both members, returns room id.
- `get_chat_inbox()` — returns one row per room with `room_id`, `type`, `display_name`, `avatar_url`, `last_message`, `last_message_at`, `unread_count`, `other_user_id` (for direct).

**Realtime** — enable replication on `chat_messages` and `chat_rooms`.

**Storage** — reuse a new public bucket `chat-attachments` (or reuse `pharmacy-assets` under a `chat/` prefix). Plan picks a new bucket for clean separation.

## 2. Header Update (`src/components/AppHeader.tsx`)

Add a new `MessageBubble` component between Bell and Avatar (per request: "between profile icon and bell"). Final order, left → right: `Logo … Bell · MessageBubble · Avatar`.

- `MessageSquare` icon, same button styling as bell.
- Green badge (`bg-green-500`) with unread count, capped at "9+".
- Click → navigates to `/messages` (full-screen Inbox), not a popover (better mobile UX).

## 3. Inbox Page (`/messages` → `src/pages/Messages.tsx`)

WhatsApp-style chat list:
- Top bar: back button, "Messages" title, search icon.
- Search bar (sticky) filtering staff names + group names.
- Chat rows: avatar, name, last message preview (truncated), timestamp (relative), green unread count circle on right.
- FAB bottom-right: opens "New chat" sheet → tabs "Direct" (list of all pharmacy staff from `get_pharmacy_member_names()`) / "New Group" (admin only).
- Empty state: "No conversations yet — start chatting with your team."

## 4. Conversation Page (`/messages/:roomId` → `src/pages/ChatRoom.tsx`)

- Header: back, avatar, name, presence subtitle ("online" if `last_seen` within 60s, else "last seen …"; "typing…" when realtime typing event received).
- Message list (reverse-chronological scroll, auto-scroll to bottom on new message):
  - Sent (right): `bg-[#dcf8c6]` bubble, time + double-tick (✓✓ blue if recipient's `last_read_at >= message.created_at`).
  - Received (left): `bg-white` bubble; in groups, sender name in a deterministic color above the bubble (hash of user_id → from a 6-color palette).
- Input bar (sticky bottom): `+` attachment, emoji button (uses native emoji input for v1 — no extra dep), text input, send button.
- Attachments: image/document upload to `chat-attachments` bucket, store URL in `attachment_url`.
- Typing indicator: broadcast via Supabase channel `room:${roomId}` (presence/broadcast, no DB writes).
- Marks room read: on mount + on new message arrival while open, update `last_read_at = now()` in `chat_room_members`.

## 5. Group Management

- "New Group" sheet (admin only — gated by `profile.role === 'admin'`):
  - Group name, optional avatar upload, multi-select staff list.
  - Creates `chat_rooms` row + member rows in one RPC call.
- Group chat header tap → "Group Info" sheet: members list, add/remove (admin only), leave group.

## 6. Hooks & Utilities (new files)

- `src/hooks/useChatInbox.ts` — fetches `get_chat_inbox()`, subscribes to `chat_messages` inserts to refresh; exposes `{ rooms, totalUnread, loading }`.
- `src/hooks/useChatRoom.ts` — fetches messages for a room, subscribes to inserts/updates, exposes `{ messages, sendMessage, members, typingUsers, markRead }`.
- `src/hooks/usePharmacyStaff.ts` — calls existing `get_pharmacy_member_names()` + presence RPC for the new-chat picker.
- `src/lib/chatColors.ts` — deterministic color picker for sender names.

## 7. Integration Points

- `MessageBubble` reads `totalUnread` from `useChatInbox` (lightweight: only counts, no message bodies).
- Add routes `/messages` and `/messages/:roomId` in `src/App.tsx` (protected, wrapped in `AppLayout` for inbox; chat room uses its own full-height layout without bottom nav).

## 8. Files

**New**
- `supabase/migrations/<ts>_chat.sql` (tables, RLS, RPCs, realtime publication, storage bucket policies)
- `src/components/messaging/MessageBubble.tsx` (header icon)
- `src/components/messaging/InboxRow.tsx`
- `src/components/messaging/MessageItem.tsx`
- `src/components/messaging/ChatInput.tsx`
- `src/components/messaging/NewChatSheet.tsx`
- `src/components/messaging/NewGroupSheet.tsx`
- `src/components/messaging/GroupInfoSheet.tsx`
- `src/pages/Messages.tsx`
- `src/pages/ChatRoom.tsx`
- `src/hooks/useChatInbox.ts`
- `src/hooks/useChatRoom.ts`
- `src/hooks/usePharmacyStaff.ts`
- `src/lib/chatColors.ts`

**Edited**
- `src/components/AppHeader.tsx` — add `<MessageBubble />` between bell and avatar.
- `src/App.tsx` — add `/messages` and `/messages/:roomId` routes.

## Out of Scope (v1)

- Message reactions, replies, forwarding.
- Voice/video calls.
- Push notifications (in-app only; uses existing browser tab).
- Message editing UI beyond the 5-minute window backend allows.
- End-to-end encryption (RLS-protected only).

## Note on User Identity

Names, avatars, phone, role come live from `profiles` (already powering the Profile page). No duplication — the chat picker queries `get_pharmacy_member_names()` joined with `profiles` for avatar/role.
