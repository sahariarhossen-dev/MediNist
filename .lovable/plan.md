# Topic-Based Multi-Threaded AI Chat

## What exists today (verified)

- `ai_conversations` (id, pharmacy_id, user_id, title, created_at, updated_at) and `ai_messages` (conversation_id, role, content, created_at) already exist — a thread table is already in place, so no new "session" table is needed.
- `/workspace` (`src/pages/Workspace.tsx`) renders a hardcoded pinned "MediNist AI (Co-pilot)" row that always navigates to the single route `/workspace/ai`, and reads the newest `ai_conversations` row to build its preview.
- `/workspace/ai` → `src/pages/AIAssistant.tsx` loads all conversations for the user and auto-resumes the most recent one; thread switching lives in a slide-over `ConversationSidebar`, not in a URL.
- `NewChatSheet` offers only "New group" + staff members.
- Agentic layer already shipped: `[[agent:v1]]` block parsing (`src/lib/agentCards.ts`), cards, action pills, slash commands, forward-to-staff drawer, `aiActivity` local store.

So this is mostly a **routing + topic-scoping refactor**, not a new backend.

## Blueprint

### Phase 1 — Topic threads as first-class routes
- Add `topic` metadata to `ai_conversations`: `topic_key` (text, nullable — `sales`, `stock`, `expiry`, `staff`, `dues`, `general`) and `archived_at`. `title` becomes the user-entered Topic Title. Keep both nullable so all existing rows stay valid.
- New route `/workspace/ai/:conversationId`; `AIAssistant` reads the id from `useParams` instead of auto-resuming, and is keyed by it so messages never bleed between topics.
- `/workspace/ai` (legacy) becomes a resolver: newest non-archived thread → redirect; nothing → back to `/workspace` with the new-chat sheet open. Old links keep working.
- Remove the always-on pinned AI row. AI threads appear in the Chats timeline as normal rows (sparkle avatar, topic title, last-message preview, unseen badge) merged and sorted with staff rooms by recency. Pin/mute reuse `threadPrefs` with an `ai:<id>` key.

### Phase 2 — New Chat → Topic modal
- `NewChatSheet` gets a top "MediNist AI (Co-pilot)" entry above New group/staff.
- Tapping it opens `AiTopicModal`: topic title input + a row of preset topic chips (Sales Analysis, Expiring Medicines, Stock & Reorder, Staff Performance, Customer Dues, General). Chip selection prefills the title and sets `topic_key`; free text stays allowed and is classified to `general`.
- Save → insert `ai_conversations` row → navigate to `/workspace/ai/<id>`.

### Phase 3 — Context-aware welcome + quick actions
- New `src/lib/aiTopics.ts`: one registry mapping `topic_key` → greeting, 3–4 quick-action prompts, slash-command subset, default canvas mode, and a system-prompt focus line.
- Welcome message becomes topic-derived (client-side, not persisted). Quick actions render as chips above the composer and adapt after each reply (reuse existing `deriveSuggestions`).
- `ai-chat` receives `topic_key` and appends a short focus directive to the existing system prompt. RBAC scoping, redaction and data fetching are untouched.

### Phase 4 — Smart Context Bridge (cross-thread linking)
- The AI never gets other threads implicitly. Bridging is explicit and user-initiated: a "Link a topic" control in the thread header opens a picker of the user's other threads; the selected thread contributes a **summary only** (last N assistant turns, condensed server-side) passed as a clearly-labelled `bridged_context` block.
- Bridge links stored in `ai_thread_links` (from_conversation, to_conversation) so the UI can show a "Linked: Sales Analysis" chip and the user can unlink.
- Server-side guard: both conversation ids must belong to the caller's `user_id` and `pharmacy_id`; bridging cannot widen the caller's role scope — redaction runs on the bridged summary too.

### Phase 5 — Topic-driven dynamic canvas
- `AiCanvas` panel: desktop = right split pane (55/45), mobile = swipe-up sheet with a drag handle.
- Canvas content chosen by `topic_key` + the latest `[[agent:v1]]` card kind — sales → chart (reuse `SalesTrendChart`), stock/expiry → medicine card grid, staff → performance widgets, dues → ledger list. No canvas for `general`.
- Canvas is a pure projection of the last agent block; no new queries, no new state store.

### Phase 6 — @Staff mentions inside AI threads
- `@` in the AI composer opens the existing `MentionPopover`-style picker fed by `usePharmacyStaff`.
- On send, mentions are stripped from the model prompt and turned into a task hand-off: the AI-generated text (plus card payload) is inserted into the staff direct room via the existing `get_or_create_direct_room` + `sendMessage` path, and a delivery-receipt pill appears in the AI thread ("Sent to Rakib").
- Mentions never grant the mentioned staff access to the AI thread itself — only the forwarded message.

### Phase 7 — Polish
- Archive/rename/delete topic via long-press context menu (reuse `ThreadContextMenu`), soft-delete via `archived_at`.
- Empty state in Chats: "No conversations yet — start one with your team or the AI co-pilot".
- Thread header shows topic title + topic chip + linked-topic chip.

## Architecture & security answers

**Thread isolation without bloat.** Reuse `ai_conversations`/`ai_messages`; a "thread" is a row, not a session object. Keep RLS as `user_id = auth.uid()` AND same-pharmacy — AI threads stay private to their creator, which is what avoids cross-role leakage (a salesman's thread is never visible to the owner and vice versa). Bloat control: index `(user_id, updated_at desc)`, load messages with a windowed query (last 50, older on scroll), soft-archive instead of unbounded growth, and optionally a scheduled prune of archived empty threads.

**Role scoping.** The edge function keeps deriving scope from the JWT, never from the client payload. `topic_key` and `conversation_id` are treated as untrusted input: both are validated against ownership before any data fetch. Redaction (profit/margin for salesman) runs after generation, including on bridged summaries.

**Value-adds worth building.** Auto-generated topic titles from the first question; thread-level "pinned insight" the AI keeps updated; scheduled topics (a Sales thread that posts a daily digest); export a thread to Notes (the `messageToNote` path already exists); topic templates per role; a "why this number" trace on any card.

**UI/UX direction.** Keep the current calm pharma palette; add a sparkle-gradient avatar for AI rows, spring-eased canvas transitions, skeleton cards while streaming, haptic-style press states on action pills, and a mobile-first single-column thread with the canvas as a swipe-up layer. No new colour system — existing tokens only.

## Risks & mitigations

- **Route change breaks bookmarks / internal links** → keep `/ai` and `/workspace/ai` as redirect resolvers; nothing 404s.
- **`AIAssistant` currently owns thread selection state** → move the active id to the route param in one pass; keying the component by id prevents message bleed and stale `receipts`/attachment state.
- **`ai-chat` payload shape change** → additive fields only (`conversation_id`, `topic_key`, `bridged_context`), all optional; existing tests keep passing and old clients still work.
- **Migration safety** → new columns nullable with defaults, plus GRANTs on any new table (`ai_thread_links`) in the same migration, RLS scoped to `auth.uid()`.
- **Workspace preview query** → the current single-conversation preview lookup is replaced by a per-thread list query; must not N+1 (one grouped query for last message per thread).
- **Mentions could imply shared AI threads** → deliberately scoped to forwarding only, so no RLS relaxation on `ai_messages` is ever needed.

## Delivery order
Phases 1–2 ship first (clean list, new-chat entry, topic modal, per-thread routes) and are independently usable. Then 3, 5, 4, 6, 7.
