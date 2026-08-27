# Phase 5 — Polish & Extra Agentic Touches

All frontend-only. No new tables, RLS, RPC or edge-function changes; existing `get_chat_inbox`, `mark_room_read` and the `ai-chat` call stay untouched.

## 1. AI thinking state + unread badge on the pinned row

- New tiny store `src/lib/aiActivity.ts`: a `localStorage` + `window` event bridge holding
  `thinking: boolean`, `lastAssistantAt`, `lastSeenAt`, with a `useAiActivity()` hook.
- `AIAssistant.tsx` marks `thinking` on send / clears it in `finally`, stamps `lastAssistantAt`
  when a reply lands, and stamps `lastSeenAt` on mount and when the thread is scrolled to bottom.
- `Workspace.tsx` pinned AI row: when thinking, replace the preview text with an animated
  "MediNist AI is thinking…" line (three-dot bounce, reusing the `TypingIndicator` dot styling);
  when `lastAssistantAt > lastSeenAt`, show the same emerald pill badge `InboxRow` uses.
- Works across tabs via the `storage` event; survives navigation because state lives outside React.

## 2. Follow-up suggestion chips

- `agentCards.ts` already parses `suggestions[]` from `[[agent:v1]]`. Add
  `deriveSuggestions(question, reply)` as the fallback for replies with no block
  (sales → "Compare with yesterday", "Top selling medicine?"; stock → "Which items to re-order?",
  "Expiring in 30 days?"; dues → "Who owes the most?").
- `ChatMessage.tsx`: render chips below `AgentActionBar` (pill style matching the action bar),
  only on the **last** assistant message, via a new `suggestions` + `onSuggestion` prop.
- `AIAssistant.tsx` passes `onSuggestion={sendMessage}` so a tap sends the prompt immediately.

## 3. Delivery receipt pill

- `ForwardToStaffDrawer`: after a successful insert, keep the sheet open briefly and show an inline
  receipt row — `✓ Sent to Rakib — 5 items` — where the item count comes from counting list lines
  in the forwarded body (falls back to "report" when there are no list lines).
- Report the same receipt back to the caller through a new optional `onSent(receipt)` prop;
  `AIAssistant.tsx` stores it and renders a persistent receipt pill under the message that was
  forwarded, so the owner sees the delivery state in the thread too.

## 4. Mobile UX: long-press menu, empty states, single scroll container

- New `src/lib/threadPrefs.ts`: `localStorage`-backed pinned/muted room id sets + `useThreadPrefs()`
  hook (no schema change needed for pin/mute).
- `InboxRow`: add long-press (450 ms touch timer, same pattern as `MessageItem`) + right-click
  handler opening a bottom `Sheet` with **Pin/Unpin**, **Mute/Unmute**, **Mark as Read**.
  Mark as read calls the existing `mark_room_read` RPC then `refresh()` from `useChatInbox`.
  Pinned rows sort first and show a pin glyph; muted rows render the badge in grey and are excluded
  from the header/bottom-nav unread total.
- `Workspace.tsx`: per-filter empty states with a friendly line and one action
  (AI Co-pilot → "Ask MediNist something", Staff → "Start a chat", Alerts → "No broadcasts yet",
  All → current copy), each using the existing icon set.
- `Workspace.tsx` gets its own `overflow-y-auto` scroll container registered through
  `useScrollContainer` (as `AIAssistant` does) so the bottom nav hide-on-scroll behaves; the page
  header/search/chips stay sticky at the top of that single container.

## Technical notes

- Files added: `src/lib/aiActivity.ts`, `src/lib/threadPrefs.ts`,
  `src/components/messaging/ThreadContextMenu.tsx`.
- Files edited: `src/pages/Workspace.tsx`, `src/pages/AIAssistant.tsx`,
  `src/components/ai/ChatMessage.tsx`, `src/components/messaging/InboxRow.tsx`,
  `src/components/workspace/ForwardToStaffDrawer.tsx`, `src/lib/agentCards.ts`.
- Styling stays on current Tailwind tokens, shadcn `Sheet`, and lucide icons.
- Verification: typecheck + existing vitest suite; then a manual pass over `/workspace`
  (thinking state, badge, long-press menu, empty tabs) and `/workspace/ai` (chips, receipt pill).
