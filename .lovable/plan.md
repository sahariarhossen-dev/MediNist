

## Plan: Professional AI Chat Assistant with Pharmacy Data Access

### Security note about your API key
You pasted your Gemini API key directly in chat. **Please rotate it immediately** at https://aistudio.google.com/apikey — pasted-in-chat keys should be considered compromised. I will use Lovable's secure secret prompt (not the chat value) to store the new key.

Also: `GEMINI_API_KEY` already exists in your Supabase secrets. I'll trigger the secret-update flow so you can paste your **new rotated** key into the secure form.

### What I'll build

A polished `/ai` page (ChatGPT/Gemini style) wired to a secure Supabase Edge Function that calls **Gemini 1.5 Flash** with live read-only context from your `medicines` and `sales` tables.

### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/AIAssistant.tsx` | Create | Full-page chat UI |
| `src/components/ai/ChatMessage.tsx` | Create | Message bubble (user/assistant) with markdown |
| `src/components/ai/TypingIndicator.tsx` | Create | Animated "thinking" dots |
| `src/components/BottomNav.tsx` | Edit | Add **AI** item (`Sparkles` icon) between Sales and More |
| `src/App.tsx` | Edit | Add `/ai` protected route inside `AppLayout` |
| `supabase/functions/ai-chat/index.ts` | Create | Secure Gemini proxy + pharmacy context |
| `supabase/config.toml` | Edit | Register `ai-chat` function |
| `package.json` | Edit | Add `react-markdown` |

### UI design (mobile-first)

```text
┌─────────────────────────────┐
│ ✨ MediNist AI    ● Online  │  Gradient header
├─────────────────────────────┤
│ ✨ Hi! I'm your pharmacy    │  Assistant bubble (gray)
│    assistant. Ask about     │
│    your stock or sales.     │
│                             │
│   [Today's sales?] [Stock?] │  Suggestion chips
│                             │
│           How's my stock? ▕ │  User bubble (blue gradient)
│                             │
│ ✨ ● ● ●                    │  Typing indicator
├─────────────────────────────┤
│ ┌──────────────────┐  ┌───┐│
│ │ Ask anything...  │  │ ▶ ││  Pill input + send
│ └──────────────────┘  └───┘│  (disabled while loading)
└─────────────────────────────┘
[Dashboard] [Sales] [✨ AI] [More]
```

### Data access strategy (read-only, RLS-respecting)

The edge function will:
1. Validate the user's JWT (passed via `Authorization` header)
2. Create a Supabase client **with the user's token** so RLS policies apply automatically — the AI only ever sees data the user is allowed to see
3. Fetch a compact summary before each Gemini call:
   - Top 50 medicines: name, company, stock_quantity, price, expiry_date, stock_alert
   - Last 30 days of sales: count, total revenue, top 10 selling items
   - Low-stock items (stock_quantity ≤ stock_alert)
4. Inject this as context into the system prompt so Gemini can answer specific questions

This keeps payloads small, fast, and secure.

### Edge function structure (`ai-chat`)

```text
Request → validate JWT → fetch pharmacy context (RLS-bound)
       → build system prompt + context + user message
       → call gemini-1.5-flash-latest (10s timeout)
       → return reply  |  on 429 → friendly "busy" message
```

- CORS enabled for browser calls
- `verify_jwt = true` (default) — only logged-in users
- Conversation history sent each request (last 10 messages from frontend state)
- Detailed error logging server-side; friendly messages client-side

### Safety logic

- Send button + input **disabled** while `isLoading` (one-at-a-time enforced)
- Empty messages blocked
- 429 → *"I'm a bit busy, please try again in a moment."*
- 500 → *"Something went wrong. Please try again."*
- Auto-scroll to newest message; markdown rendered for AI responses

### Implementation order

1. **Phase 1 (UI only)**: Create page, components, nav item, route, install `react-markdown`
2. **Phase 2 (secret)**: Trigger secure prompt to update `GEMINI_API_KEY` with your rotated key
3. **Phase 3 (backend)**: Create `ai-chat` edge function with pharmacy data access, wire frontend
4. **You test** — send a test question like *"What's my stock level?"*

### What you need to do

1. **Rotate your key now** at https://aistudio.google.com/apikey (the one in chat is compromised)
2. After Phase 1 completes, I'll show a secure secret-input form — paste the **new** key there
3. Test the chat once Phase 3 is done

