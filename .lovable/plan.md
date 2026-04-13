

## Activate MediNist AI with Client-Side Gemini SDK

### Overview
Replace the current edge-function-based chat with a direct client-side integration using the `@google/generative-ai` npm package and `VITE_GEMINI_API_KEY`.

### What changes

**1. Install dependency**
- Add `@google/generative-ai` npm package

**2. Create `src/lib/geminiClient.ts`**
- Initialize `GoogleGenerativeAI` with `import.meta.env.VITE_GEMINI_API_KEY`
- Use `gemini-1.5-flash` model
- System instruction: *"You are a professional pharmacy assistant for Naseer Medical Hall. Help the owner manage inventory, sales, and medicine information."*
- Export a `streamChat` function that takes message history and streams responses

**3. Update `src/components/ai/ChatScreen.tsx`**
- Remove the edge function fetch logic (`CHAT_URL`, auth session check, SSE parsing)
- Replace with `streamChat()` from `geminiClient.ts` using the SDK's built-in streaming
- Keep all existing UI, markdown rendering, suggestion chips, and localStorage persistence (already handled via `chatStore.ts`)

**4. User must set the environment variable**
- `VITE_GEMINI_API_KEY` in the project's `.env` file — you'll need to provide the key value

### Persistent memory
Already implemented — `chatStore.ts` saves all conversations to localStorage and `ChatScreen` calls `updateMessages()` on every change. No modifications needed.

### Files changed
- `src/lib/geminiClient.ts` — new file
- `src/components/ai/ChatScreen.tsx` — replace fetch logic with SDK calls
- `package.json` — new dependency

### Important note
Exposing `VITE_GEMINI_API_KEY` on the client side means the key is visible in the browser. This is acceptable for personal/internal use but not for production apps with public access.

