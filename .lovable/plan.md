

## Plan: MediNist AI Assistant with Gemini via Lovable AI Gateway

### Overview
Build a pharmacy AI chatbot using Lovable AI Gateway (which serves Gemini). The bot queries Supabase for inventory/sales data and answers pharmacy-related questions with streaming responses.

### Architecture

```text
User Chat UI ──► Edge Function (chat-pharmacy) ──► Lovable AI Gateway (Gemini)
                       │
                       ▼
                 Supabase DB (read-only queries for context)
```

### 1. Edge Function: `supabase/functions/chat-pharmacy/index.ts`

- Receives user messages + conversation history
- Validates JWT via `getClaims()`
- Before calling the AI, runs relevant Supabase queries based on user intent:
  - Inventory stats: `SELECT COUNT(*), SUM(stock_quantity) FROM medicines WHERE pharmacy_id = ...`
  - Today's sales: `SELECT COUNT(*), SUM(total) FROM sales WHERE pharmacy_id = ... AND created_at >= today`
  - Medicine search: `SELECT * FROM medicines WHERE name ILIKE '%term%' LIMIT 10`
  - Master catalog lookup for symptom-based suggestions
- Injects query results into the system prompt as context
- Calls Lovable AI Gateway with streaming enabled
- System prompt: "You are MediNist AI, a pharmacy assistant for Naseer Medical Hall. You have access to real-time inventory and sales data. Always add a medical disclaimer when suggesting medicines."

### 2. AI Page Redesign: `src/pages/AI.tsx`

Replace the "Coming soon" placeholder with a full chat interface:
- Chat message list with markdown rendering (react-markdown)
- Input bar at the bottom with send button
- Streaming token-by-token display
- Loading indicator while AI responds
- Messages styled differently for user vs assistant

### 3. No Floating Icon

Since there's already an "AI" tab in the bottom nav, the chat will live on the `/ai` route directly. No separate floating icon needed — the bottom nav already provides access.

### Files Modified
- `supabase/functions/chat-pharmacy/index.ts` (new — edge function)
- `src/pages/AI.tsx` (rewrite — chat UI with streaming)

### Dependencies
- `react-markdown` (for rendering AI responses)

### No database changes needed
The edge function reads existing tables (medicines, sales, master_medicines) using the service role key.

