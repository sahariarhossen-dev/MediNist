# Plan: Support Google Auth Key Format (AQ.*) in ai-chat Edge Function

## Goal
Update the `ai-chat` Supabase Edge Function so it works with the newer Google AI Studio Auth Key format (`AQ.*`) which requires header-based authentication instead of the `?key=` query parameter currently used.

## Background
The current implementation calls Gemini at:

```ts
const dsRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  ...
});
```

Google's newer OAuth-style API keys (starting with `AQ.`) reject the `?key=` query parameter with `401 ACCESS_TOKEN_TYPE_UNSUPPORTED`. They require the key to be passed as a Bearer token in the `Authorization` header, and/or as `x-goog-api-key`.

## Changes

### 1. `supabase/functions/ai-chat/index.ts` — Gemini request
- Replace the `?key=${GEMINI_API_KEY}` URL construction with the clean `GEMINI_URL`.
- Add both supported headers to the `fetch` call:
  - `Authorization: Bearer ${GEMINI_API_KEY}`
  - `x-goog-api-key: ${GEMINI_API_KEY}`
- Keep existing `Content-Type: application/json` header.
- Leave the request body (system instruction, contents, generationConfig) unchanged.

### 2. No other files touched
This is a targeted authentication compatibility fix. It does not change the prompt, RBAC, context builder, MedEx lookup, response parsing, or frontend code.

## Verification
After deployment, test the AI chat in the preview app. A successful request should return a reply instead of `401 ACCESS_TOKEN_TYPE_UNSUPPORTED`. The edge function logs will show the Gemini response status and first 4000 characters of the body for confirmation.
