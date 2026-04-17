
## Plan: Rebuild AI Assistant — Gemini-style with Supabase memory

### Sketch interpretation
- Header: AI icon (left) + "MediNist AI" title with "Naseer Madical Hall - mehedi" subtitle, profile avatar (right)
- Sidebar toggle button on the left below header
- User bubbles right-aligned, AI bubbles left-aligned with avatar
- Pill-shaped input at bottom with search icon

### 1. Database (new migration)
Two tables for persistent chat:
- `ai_conversations` — `id, user_id, pharmacy_id, title, created_at, updated_at`
- `ai_messages` — `id, conversation_id, role ('user'|'assistant'), content, created_at`
- RLS: users only access their own conversations & nested messages
- Trigger: bump `ai_conversations.updated_at` on new message insert

### 2. Edge function update (`ai-chat`)
- Prepend Bengali/Banglish system instruction:
  > "You are an expert Bangladeshi Pharmacy Assistant. Understand and respond in Bengali and Banglish (Bengali written in English letters) naturally and concisely."
- Keep existing pharmacy data context + DeepSeek call

### 3. New components
- `src/components/ai/ConversationSidebar.tsx` — Sheet drawer (slide from left) listing conversations + "+ New Chat" button + delete action per item
- `src/components/ai/ChatHeader.tsx` — fixed header: AI icon, title, truncated `Pharmacy - User` subtitle, avatar→/profile, sidebar toggle button on left below

### 4. Rewrite `src/pages/AIAssistant.tsx`
- On mount: load conversations, auto-resume most recent (or create new if none)
- On send: insert user msg → call edge function with last 20 messages → insert assistant msg
- New Chat button creates fresh conversation (title auto-set from first user message, truncated to 50 chars)
- Pill input with Send icon (sketch shows search-style icon — use Send for clarity, keep pill shape)
- Disable send while loading; full responsive (header text truncates with ellipsis)
- Profile avatar reads from `profiles.avatar_url`; clicking navigates to `/profile`

### 5. Layout
```text
┌─────────────────────────────────────┐
│ [AI] MediNist AI          [Avatar] │  Fixed gradient header
│      Naseer Madical... - mehedi    │
├─────────────────────────────────────┤
│ [☰] Chat history                    │  Sidebar trigger row
├─────────────────────────────────────┤
│   [AI bubble]                       │  Scrollable
│                       [User bubble] │
│   [AI typing...]                    │
├─────────────────────────────────────┤
│  ( Ask anything...           ➤  )   │  Pill input
└─────────────────────────────────────┘
```

### Files
- **NEW** `supabase/migrations/<ts>_ai_chat_memory.sql`
- **EDIT** `supabase/functions/ai-chat/index.ts`
- **NEW** `src/components/ai/ConversationSidebar.tsx`
- **NEW** `src/components/ai/ChatHeader.tsx`
- **EDIT** `src/pages/AIAssistant.tsx`

### Defaults (proceeding without questions, easy to change after)
- Sidebar = slide-in drawer from left (best for 390px mobile)
- Auto-resume most recent conversation on open
- Send last 20 messages as context to DeepSeek
