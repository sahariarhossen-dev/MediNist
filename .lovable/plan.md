# AI Architecture Switch: Gemini Flash (reasoning + vision) + Groq Whisper (voice)

Note: Lovable AI Gateway could serve both Gemini and speech-to-text with no keys to manage, but this plan follows your explicit choice of direct Gemini + Groq APIs.

## What changes

### 1. `ai-chat` edge function — Gemini Flash instead of DeepSeek
- Swap the DeepSeek call for Google Gemini `generateContent` (`gemini-1.5-flash`), keeping everything else intact: JWT validation, role resolution (owner/manager/salesman), RBAC scope header, live pharmacy context, MedEx lookup, redaction post-filter, and the `{ reply }` response shape the client already expects.
- Translate the existing message list into Gemini's format: `systemInstruction` for the system prompt, `contents[]` with `role: "user" | "model"` and `parts[]`.
- Read `GEMINI_API_KEY` from secrets; fail with a clear configuration error when missing. Keep `GROQ_API_KEY` available for transcription.
- Preserve current error semantics: rate limit / quota / credit statuses are surfaced to the UI rather than hidden, so the existing 429/402 handling in the chat page keeps working.
- Drop the aggressive 30s abort so long vision calls are not cut off mid-generation.

### 2. Prompt update
- Add explicit instruction that Bengali and Banglish (romanized Bengali) input is first-class: reply in the language/script the user used.
- Restate the `[[agent:v1]]` block contract (cards / actions / suggestions) as a strict output rule with a compact example, so generative UI cards render reliably.
- Add an image-analysis section: when an image is attached, extract prescriptions (medicine, strength, dosage, duration) or invoices (supplier, items, quantities, rates, totals) and return them as an `[[agent:v1]]` list/summary card, never as a wall of text.

### 3. Image (prescription / invoice) input
- Accept an optional `images: [{ mimeType, data }]` array (base64, no data-URL prefix) in the request body, validated for count, mime type (jpeg/png/webp) and size.
- Attach them as `inlineData` parts on the latest user turn so Gemini Flash performs the OCR/vision pass.

### 4. Voice transcription — new `voice-transcribe` edge function
- Accepts an audio upload (multipart), validates size/type, forwards it to Groq `whisper-large-v3-turbo` with `GROQ_API_KEY`, and returns `{ text }`.
- Same JWT validation and generic error handling as the other functions.

### 5. Chat composer UI (`src/pages/AIAssistant.tsx`)
- Microphone button: tap to record (`MediaRecorder`), tap again to stop; shows a recording state with elapsed time, then a "transcribing" state. The returned transcript is inserted into the input box so the user can edit before sending.
- Image button: opens the file picker (camera capture allowed on mobile), shows a small removable thumbnail chip above the textarea; the image is downscaled client-side and converted to base64.
- Sending with an attached image includes it in the `ai-chat` body; the user message shows an "Attached prescription/invoice" indicator. Send is enabled when there is text OR an image.
- Buttons match the existing composer styling (Lucide icons, same pill/round treatment as the slash and Tools buttons). No visual redesign of the rest of the chat.

## Secrets required
`GEMINI_API_KEY` and `GROQ_API_KEY` — I will request both before deploying. `DEEPSEEK_API_KEY` becomes unused.

## Verification
- Send a Bengali and a Banglish text query and confirm a Gemini reply plus intact agent cards.
- Upload a prescription photo and confirm a structured card comes back.
- Record a short voice note and confirm the transcript lands in the input box.
