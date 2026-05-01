## Root cause

The `profiles` table has RLS `USING (id = auth.uid())` — a user can only SELECT their own row. In `useChatRoom.ts` we do:

```ts
supabase.from("profiles").select("id,full_name,avatar_url,role,phone").in("id", ids)
```

For every teammate in the room this returns `null`, so the chat header shows "Direct chat" / "DC", and ProfileSheet shows "Member" with no avatar and no phone. The inbox list works because it goes through the `get_chat_inbox` SECURITY DEFINER RPC.

## Fix

### 1. New SECURITY DEFINER RPC (migration)

Add `public.get_pharmacy_member_directory()` returning `id, full_name, avatar_url, role, phone, last_seen` for every profile sharing the caller's `pharmacy_id`. Mirrors existing `get_pharmacy_member_presence` but also exposes `phone` (needed by ProfileSheet). Granted to `authenticated`.

### 2. `src/hooks/useChatRoom.ts`

Replace the direct `from("profiles")...in("id", ids)` query with `supabase.rpc("get_pharmacy_member_directory")`, then build the lookup map from the result. Also surface `last_seen` (real presence) on `RoomMember` instead of repurposing `last_read_at` for online status.

### 3. `src/pages/ChatRoom.tsx`

- Header title: when `room.type === "direct"`, always render `other?.full_name` and only fall back to "Teammate" (never "Direct chat") once members have loaded.
- Subtitle online check: use `other.last_seen` (from the new RPC) instead of `last_read_at`.
- Pass `member.last_seen` (not `last_read_at`) into `ProfileSheet`.

### 4. `src/components/messaging/ProfileSheet.tsx`

- `humanRole` already maps `admin → Owner`; extend to: `admin → Owner`, `manager → Manager`, `salesman → Salesman`, anything else → titlecased value, null → "Member".
- "Verified teammate" row: show "Yes" only when the viewed member's `pharmacy_id` matches the current user's `pharmacy_id`. Since the directory RPC already filters by pharmacy, any returned member is verified — pass an explicit `verified: true` boolean from `ChatRoom.tsx` (computed as `other != null`, since RPC only returns same-pharmacy members) and render Yes/No accordingly.

### 5. `src/components/messaging/GroupInfoSheet.tsx`

Same `humanRole` extension and same `last_seen` propagation when opening a member's ProfileSheet from the group list.

## Technical details

- Migration SQL (concept):
  ```sql
  create or replace function public.get_pharmacy_member_directory()
  returns table(id uuid, full_name text, avatar_url text, role text, phone text, last_seen timestamptz)
  language sql stable security definer set search_path = public as $$
    select p.id, p.full_name, p.avatar_url, p.role, p.phone, p.last_seen
    from public.profiles p
    where p.pharmacy_id = public.get_user_pharmacy_id();
  $$;
  grant execute on function public.get_pharmacy_member_directory() to authenticated;
  ```
- `RoomMember` interface gains `last_seen: string | null`; existing `last_read_at` (for unread tracking) stays.
- No changes needed to inbox flow — `get_chat_inbox` already returns `display_name` and `avatar_url` correctly via SECURITY DEFINER.

## Files touched

- `supabase/migrations/<new>.sql` — create RPC
- `src/hooks/useChatRoom.ts` — use RPC, add `last_seen`
- `src/pages/ChatRoom.tsx` — header name, online via `last_seen`, pass `last_seen` + verified flag
- `src/components/messaging/ProfileSheet.tsx` — full role map, verified prop
- `src/components/messaging/GroupInfoSheet.tsx` — role map + `last_seen` propagation
