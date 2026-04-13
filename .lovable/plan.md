

## Secure Gemini API Key via Backend Edge Function

### Overview
Move all Gemini API calls to the existing `chat-pharmacy` edge function (which already uses the `GEMINI_API_KEY` secret server-side). Remove all client-side API key logic.

### Steps

**1. Update the GEMINI_API_KEY secret**
- Use the secrets tool to set `GEMINI_API_KEY` to the value you provided (`AIzaSyAiKt-9HxPvK3QaE5r7cRS2qqPMw7ls2d0`)

**2. Update `src/components/ai/ChatScreen.tsx`**
- Remove imports of `ApiKeySetup`, `streamChat`, `checkConnection`, `hasApiKey` from geminiClient
- Remove the `needsKey` state and `ApiKeySetup` modal rendering
- Remove the connection-check `useEffect`
- Replace `streamChat()` with an SSE fetch to the `chat-pharmacy` edge function, parsing streamed tokens the same way
- Use `supabase.auth.getSession()` for the Authorization header

**3. Delete `src/components/ai/ApiKeySetup.tsx`**
- No longer needed

**4. Clean up `src/lib/geminiClient.ts`**
- Delete or gut this file — all Gemini logic is now server-side

**5. Edge function (`chat-pharmacy`) — no changes needed**
- Already reads `GEMINI_API_KEY` from env, authenticates user, fetches pharmacy data, and streams Gemini responses

### Files changed
- `src/components/ai/ChatScreen.tsx` — rewrite send logic to call edge function
- `src/components/ai/ApiKeySetup.tsx` — delete
- `src/lib/geminiClient.ts` — delete
- Secret `GEMINI_API_KEY` — update value

### Security result
- API key never reaches the browser
- No localStorage key storage
- No API key input UI
- All requests authenticated via Supabase JWT

