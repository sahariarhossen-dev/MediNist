

## Floating AI Chat Assistant for MediNist

### Overview
Build a floating chat bubble component that appears on all protected pages (via AppLayout). Tapping the bubble opens a full-screen mobile chat overlay with a scrollable message area, stylish input, and close button. Pure frontend — no API integration yet.

### Architecture

- **`src/components/ai/FloatingChatBubble.tsx`** — The bubble button (bottom-right, above BottomNav) + the chat overlay panel
- **`src/components/ai/ChatMessage.tsx`** — Individual message bubble (user vs assistant styling)
- **`src/components/AppLayout.tsx`** — Add `<FloatingChatBubble />` alongside `<BottomNav />`
- **`src/pages/AI.tsx`** — Redirect to `/` or show the floating chat (since chat is now a floating overlay, the `/ai` route can auto-open it)

### UI Design

```text
┌──────────────────────┐
│  ✕  MediNist AI      │  ← Header with close button
├──────────────────────┤
│                      │
│  🤖 Hi! How can I    │  ← Assistant bubble (left-aligned, gray bg)
│     help you today?  │
│                      │
│     What's my stock? │  ← User bubble (right-aligned, blue bg)
│                      │
│  (scrollable area)   │
│                      │
├──────────────────────┤
│ [Type a message... ▶]│  ← Input + send button
└──────────────────────┘

          [💬]  ← Floating bubble (bottom-right, above nav)
```

### Components Detail

**FloatingChatBubble.tsx**
- State: `isOpen` toggle
- Closed: 56px blue circular button with `MessageCircle` icon, positioned `bottom-24 right-4` (above BottomNav)
- Open: Full-screen overlay (`fixed inset-0 z-[60]`) with white background
- Header: gradient blue bar with app name + `X` close button
- Message area: `flex-1 overflow-y-auto` with bottom-scroll behavior via `useRef` + `scrollIntoView`
- Input bar: fixed bottom with `Input` + `Send` icon button
- Local state for messages array (no persistence yet)
- Placeholder assistant responses (echo or static welcome message)

**ChatMessage.tsx**
- Props: `content`, `role` ('user' | 'assistant'), `timestamp`
- User: right-aligned, blue-600 bg, white text, rounded-2xl with bottom-right corner sharp
- Assistant: left-aligned, gray-100 bg, dark text, rounded-2xl with bottom-left corner sharp
- Small timestamp below each message

### Changes Summary
| File | Action |
|------|--------|
| `src/components/ai/FloatingChatBubble.tsx` | Create |
| `src/components/ai/ChatMessage.tsx` | Create |
| `src/components/AppLayout.tsx` | Add FloatingChatBubble |
| `src/pages/AI.tsx` | Navigate to `/` or auto-open chat |
| `src/App.tsx` | Wrap `/ai` route with AppLayout |

### Key Details
- Uses Tailwind CSS only, Lucide icons (`MessageCircle`, `Send`, `X`, `Bot`)
- Mobile-first: full-screen overlay on mobile, could be a card on desktop later
- No API calls — just local message state with a welcome message
- Smooth open/close animation via Tailwind `transition` + `animate-in`
- z-index above BottomNav (`z-[60]`)
- BottomNav link to `/ai` will trigger opening the chat overlay

