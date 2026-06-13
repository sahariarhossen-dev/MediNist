## Phase 2: Live `medinist-ai-notepad` Edge Function Integration

Wire `NoteEditor.tsx` AI handlers to a real Lovable AI–powered Supabase Edge Function. Preserve all existing UI states (laser scan overlay, `AIProgressPill`, char ceiling, save-on-exit).

---

### A. New Edge Function: `supabase/functions/medinist-ai-notepad/index.ts`

Single function, two `mode`s — keeps the frontend contract simple.

Request body shape:
```ts
// OCR
{ mode: "ocr", category: "invoice" | "prescription" | "photo",
  payload: { imageUrl: string } }

// Assistant
{ mode: "assistant",
  payload: { text: string, actionId: "smart_clean" | "translate_en" | "extract_actions" } }
```

Response: `{ result: string }` (string is HTML table, plain markdown/HTML, or a JSON-encoded array of strings).

Implementation:
- CORS preflight + `corsHeaders` on every response.
- JWT validated via `supabase.auth.getClaims(token)` (no `verify_jwt` config change needed).
- Zod validation of body; reject unknown modes/actions with 400.
- Lovable AI Gateway via `@ai-sdk/openai-compatible` + `LOVABLE_API_KEY` header, model `google/gemini-3-flash-preview` (multimodal for OCR via `image_url` content block).
- Prompts:
  - **ocr/invoice** → "Return ONLY a valid HTML `<table>` (no markdown fence) with columns Item, Qty, Amount; include supplier/date/total as `<p>` tags above the table."
  - **ocr/prescription|photo** → "Return ONLY a JSON array of strings like `[\"Napa 500mg — 2 strips\", ...]`. No prose."
  - **assistant/smart_clean** → "Reformat the shop note into clean HTML using `<p><strong>Label:</strong> value</p>`."
  - **assistant/translate_en** → "Translate Bangla → English, preserve structure, return HTML paragraphs."
  - **assistant/extract_actions** → "Return JSON array of imperative action strings only."
- Map 429/402 from gateway to same-status JSON errors so the client can show specific toasts.

### B. Frontend rewrite in `src/pages/NoteEditor.tsx`

Replace **only** the two mock handler bodies; keep `insertBlockAfter`, `estimateBlockChars`, `replaceFirstTextBlock`, `stripHtml`, `scanningBlockId`, `aiProcessing`, `AIProgressPill`, and char-budget logic.

**`handleScanImage(block)`**
1. Guard: `if (scanningBlockId) return;` → `setScanningBlockId(block.id)` inside `try`.
2. Fetch fresh signed URL: `supabase.storage.from('note-attachments').createSignedUrl(block.path, 300)`. Throw on error.
3. `const { data, error } = await supabase.functions.invoke('medinist-ai-notepad', { body: { mode: 'ocr', category: block.category, payload: { imageUrl: signedUrl } } })`. Throw on error.
4. Build `newBlock`:
   - `invoice` → validate `data.result` contains `<table`, wrap in `BlockText { html: data.result }`.
   - `prescription | photo` → `JSON.parse(data.result)` → `string[]` → map to `{ id: newId(), text, checked: false }` → `BlockChecklist`.
5. Char budget: `if (estimateBlockChars(newBlock) > remaining)` → trim items / truncate HTML to fit, then `toast.warning("Note trimmed due to the global 2000-character limit.")`.
6. `insertBlockAfter(block.id, newBlock)` (this goes through `setDraft` → save-on-exit handles persistence).
7. **Background meta sync** (fire-and-forget, no await blocking UI):
   ```ts
   if (noteId && noteId !== "new") {
     const ocrText = newBlock.type === "checklist"
       ? newBlock.items.map(i => i.text).join("\n")
       : stripHtml(newBlock.html);
     supabase.from("notes").update({
       image_metadata: { ...(latest.image_metadata ?? {}),
         ocr_text: [...(latest.image_metadata?.ocr_text ?? []), { block_id: block.id, text: ocrText, at: new Date().toISOString() }] }
     }).eq("id", noteId);
   }
   ```
8. `finally { setScanningBlockId(null); }`. On catch → `toast.error("MediNist AI Engine is currently busy. Please try again.")`.

**`handleAIAction(actionId)`**
1. Close sheet. Compile text: same `stripHtml + join("\n")` over text blocks. If empty → `toast.error("Please type something first before using the AI Assistant.")` and abort.
2. `setAiProcessing(true)` inside `try`.
3. `supabase.functions.invoke('medinist-ai-notepad', { body: { mode: 'assistant', payload: { text, actionId } } })`. Throw on error.
4. Branch on `actionId`:
   - `smart_clean` / `translate_en` — take `data.result` (HTML string), char-budget check vs current first-text-block size: if over → truncate + warning toast. Then `replaceFirstTextBlock(firstTextIdx, html)`.
   - `extract_actions` — `JSON.parse(data.result)` → string[] → checklist block. Char-budget trim if needed. Insert after the last text block (or `addBlockWithCursor` if none).
5. `finally { setAiProcessing(false); }`. On catch → same busy toast.

### C. Error / status handling matrix

| Failure | UX |
|---|---|
| Network / 5xx / generic | `toast.error("MediNist AI Engine is currently busy. Please try again.")` |
| Empty editor (assistant) | `toast.error("Please type something first…")` |
| Response > 2000 chars | Truncate safely + `toast.warning("Note trimmed due to the global 2000-character limit.")` |
| Invalid JSON / missing `<table>` | Treat as parse failure → busy toast |

All state mutations route through `setDraft` so the existing save-on-exit + realtime path persists results to `public.notes` without new code.

### D. What is NOT changing
- `BlockImage.tsx`, `AIActionSheet.tsx`, `AIProgressPill.tsx`, `NoteKeyboardToolbar.tsx`, `tailwind.config.ts` — untouched.
- DB schema — no migration. `image_metadata` is already `jsonb` on `notes`.
- No new secrets — `LOVABLE_API_KEY` already configured.

---

### Open question before I build

The plan assumes the edge function `medinist-ai-notepad` should be **created in this same step** (it doesn't exist yet under `supabase/functions/`). Your prompt only described the frontend wiring. Confirm one:

1. **Build both** the edge function (with Lovable AI Gemini) + frontend rewrite together — recommended so the live integration actually works end-to-end.
2. **Frontend rewrite only** — leave the edge function for a later phase (calls will fail until you create it).