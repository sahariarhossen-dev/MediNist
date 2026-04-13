

## MediNist AI — Full Dark-Mode Redesign

### Overview
Redesign the AI assistant into a multi-screen experience matching the provided sketch: a **Conversations List** screen and a **Chat** screen, both with a dark theme (`#0A0F1C` background, `#1A8CFF` accent).

### Architecture

Split `src/pages/AI.tsx` into multiple components:

```text
src/pages/AI.tsx              → Router: list vs chat view
src/components/ai/
  ├── ConversationList.tsx     → Screen 1/3: list of chats, sections, multi-select
  ├── ConversationRow.tsx      → Single chat row with long-press support
  ├── ChatContextMenu.tsx      → Screen 2: animated long-press popup (Pin/Copy/Select/Share/Delete/Detail)
  ├── ChatScreen.tsx           → Screen 4: main chat UI (dark theme, keeps all existing send logic)
  ├── SuggestionChips.tsx      → "Today's Sales", "Low Stock", "New Medicine" chips
  └── chatStore.ts             → localStorage multi-conversation CRUD helpers
```

### Route change
`/ai` stays as-is in `App.tsx`. Internally, `AI.tsx` manages state to show either the list or a specific chat.

### Detailed plan

**1. Chat storage layer (`chatStore.ts`)**
- Data model: `{ id, title, preview, messages[], pinned, createdAt, updatedAt }`
- CRUD: `getConversations`, `createConversation`, `deleteConversation`, `togglePin`, `updateMessages`
- All in localStorage (key: `medinistai_conversations`)

**2. Conversations List (`ConversationList.tsx`)**
- Full dark background `#0A0F1C`, light text
- Header: "MediNist Conversations" in bold white
- "New Chat" button in accent color `#1A8CFF` with `+` icon
- Three sections: **PIN CHAT**, **RECENT** (last 24h), **ALL CHAT**
- Each row: pill icon, title (truncated), 2-line preview, timestamp
- Long-press (500ms) triggers context menu OR enters multi-select mode
- Multi-select state: header changes to "N Selected" with Cancel, bottom bar shows Trash/Pin icons
- Seeded with dummy conversations on first load

**3. Context Menu (`ChatContextMenu.tsx`)**
- Absolutely positioned overlay near the long-pressed row
- 6 actions in a 3×2 grid: Pin, Copy, Select, Share, Delete, Detail
- Animated with scale+opacity transition (`transition-all duration-200`)
- Backdrop overlay to dismiss

**4. Chat Screen (`ChatScreen.tsx`)**
- Dark background `#0F1623`
- Header: red back button (returns to list), branded bot icon, "Naseer Medical AI Assistant", trash + gear icons
- Message bubbles: AI = `#1B2B3A` with teal/green tint, User = `#2A2A2A`
- Small medical disclaimer text below AI messages
- Suggestion chips row above input
- Input bar: dark card, `+` button (left), placeholder "Ask me anything...", branded send button (right)
- All existing streaming/send logic preserved from current `AI.tsx`

**5. Bottom nav hidden**
- Already handled: `/ai` route doesn't use `AppLayout`, so no `BottomNav`

### Color tokens
| Token | Value |
|-------|-------|
| Page bg | `#0A0F1C` |
| Card/input bg | `#111827` |
| Accent | `#1A8CFF` |
| AI bubble | `#1B2B3A` |
| User bubble | `#2A2A2A` |
| Text primary | `#F1F5F9` |
| Text secondary | `#94A3B8` |
| Danger/back | `#EF4444` |

### Files changed
- `src/pages/AI.tsx` — rewritten as view router
- 6 new files in `src/components/ai/`
- No changes to routing, edge function, or BottomNav

