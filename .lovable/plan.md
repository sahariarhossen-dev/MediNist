# Unified Agentic Workspace (Telegram-style Inbox + AI Co-pilot)

## What exists today (verified)

- `/ai` → `src/pages/AIAssistant.tsx`: full-screen chat, own header (`ai/ChatHeader`), conversation sidebar, `ai_conversations` / `ai_messages` tables, `ai-chat` edge function (RBAC scoped, dual-mode prompt), markdown rendering via `ai/ChatMessage`.
- `/messages` → `src/pages/Messages.tsx` + `useChatInbox` (`get_chat_inbox` RPC), filter chips (All/Unread/Groups/Direct), new-chat sheet.
- `/messages/:roomId` → `src/pages/ChatRoom.tsx` + `useChatRoom` (realtime `chat_messages`, typing broadcast, `mark_room_read`).
- Rich cards already exist for staff chat: `lib/chatCards.ts` sentinel `[[card:v1]]` + `messaging/cards/ChatMedicineCard`, `ChatInvoiceCard`, rendered by `messaging/MessageItem`.
- Bottom nav tab today is "AI" → `/ai`; Messages is reachable from the global header.

Nothing gets deleted. The AI page and chat room stay as the underlying thread views; we add a unified inbox shell around them and enrich the AI thread.

## The plan

### Phase 1 — Unified Inbox shell
- New page `src/pages/Workspace.tsx` at route `/workspace`; `/messages` and `/ai` redirect into it (`/ai` → `/workspace/ai`) so no bookmark or internal link breaks.
- Bottom nav "AI" tab becomes "Chats" pointing at `/workspace` (icon: MessagesSquare), keeping the header chat shortcut.
- Inbox list = pinned "MediNist AI (Co-pilot)" row (live preview of last AI message) + existing `useChatInbox` rows + a "System Alerts" pseudo-thread fed by `pharmacy_broadcasts` / notifications (read-only).
- Filter tabs: `All | AI Co-pilot | Staff Messages | System Alerts`, reusing the current chip styling; Unread stays as a toggle.
- Thread routes: `/workspace/ai` (AI thread), `/workspace/room/:roomId` (staff thread), `/workspace/alerts`. Both thread views are the existing components refactored into embeddable components (props instead of `useParams` only), so logic is untouched.

### Phase 2 — Agentic message layer (AI thread)
- Extend the card protocol into a shared `lib/agentCards.ts` (superset of `chatCards.ts`, same sentinel family) with kinds: `medicine`, `invoice`, `sales_summary`, `stock_alert_list`, `staff_performance`, plus an `actions[]` array.
- `ai-chat` edge function: append a machine block (`[[agent:v1]]{...}`) after the prose when the answer is data-backed, derived from data it already fetched — no new DB access, no RBAC change. Redaction rules still apply before the block is built.
- `ai/ChatMessage` renders the block as cards (`ai/cards/*`) instead of raw text, and renders `actions[]` as inline pill buttons under the bubble: `Check Stock`, `Re-order`, `Assign Task to Staff`, `Forward to Staff`.
- Old messages without a block keep rendering exactly as today.

### Phase 3 — Slash commands + Mini App drawers
- `/` launcher next to the composer (`ai/SlashCommandMenu.tsx`): `/sales`, `/stock`, `/short-items`, `/staff-performance`, `/expiry` — each expands into the corresponding prompt text (no new backend).
- Slide-up drawers (shadcn `Drawer`/`Sheet`) opened from action pills: Stock lookup, Re-order draft, Assign task. Each drawer reuses existing sheets/queries where available and closes back into the thread.

### Phase 4 — Cross-chat forwarding
- "Forward to Staff" drawer: pick a staff member or group from `usePharmacyStaff` / inbox rooms, then insert into `chat_messages` via the existing `sendMessage` path, carrying the card payload so the staff thread renders the same rich card.
- Optional note field prepended as the message caption.

### Phase 5 — Polish
- Unread badges on the AI row (unseen assistant replies), swipe-free long-press actions, empty states, and a single scroll container registered for bottom-nav hide behaviour.

## Extra agentic touches worth adding
- Typing/“thinking” state in the inbox preview for the AI row.
- Pinned quick actions row above the composer that adapts to the last card shown.
- Follow-up chips suggested by the AI block (`suggestions[]`) so conversations continue in one tap.
- Delivery receipt on forwarded tasks ("Sent to Rakib — 2 items").

## Technical notes
- No table, RLS, or RPC changes required; only the `ai-chat` response shape is extended (additive, backward compatible).
- State: local component state + existing hooks (`useChatInbox`, `useChatRoom`); no new global store.
- Styling stays on current Tailwind tokens and lucide icons; cards reuse the existing chat card visual language.
- `/workspace/room/:roomId` renders without the global header for full-height chat, matching today's `ChatRoom` behaviour.

## Delivery order
Phase 1 first (shell + routing, fully working with today's features), then 2, 3, 4, 5 — each shippable on its own.
