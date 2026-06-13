
# Notepad Phase 1 — AI OCR & Smart AI Text Assistant (Mock UI)

Scope: pure frontend UI/UX + mocked handlers wired into the existing `NoteEditor` state model (`draft`, `draftRef`, `hasContentRef`, `addBlockWithCursor`, 2000-char ceiling). No backend, no edge functions, no schema changes.

---

## 1. AI OCR — "Scan with MediNist AI"

### New component
`src/components/notes/blocks/BlockImage.tsx` gains an optional `onScan?: () => void` prop and a `scanning?: boolean` prop, plus the scan button + laser overlay.

- **Button**: rendered directly under the image (inside the same card), only when `!readOnly && onScan` is provided.
  - Label: `✨ Scan with MediNist AI`
  - Style: ghost button with soft indigo tint — `bg-indigo-50/60 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-full h-9 text-xs font-medium w-full`
  - Icon: `Sparkles` from lucide-react.
- **Loading state** (when `scanning`):
  - Button text becomes `🔍 Scanning medicine details...`, disabled, with a pulsing dot.
  - On top of the `<img>`, render an animated horizontal "laser" line: absolutely positioned `h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_2px_rgba(99,102,241,0.6)]` that sweeps top→bottom via a new keyframe `scanner-sweep` added to `tailwind.config.ts` (`0% { top: 0 } 100% { top: 100% }`, 1.6s linear infinite alternate).
  - Image gets a subtle `ring-2 ring-indigo-300/60` while scanning.

### Wiring in `NoteEditor.tsx`
- New local state: `const [scanningBlockId, setScanningBlockId] = useState<string | null>(null);`
- New handler `handleScanImage(block)`:
  1. Set `scanningBlockId = block.id`.
  2. `await new Promise(r => setTimeout(r, 2000))`.
  3. Build mock block:
     - `category === 'invoice'` → `BlockText` (HTML) with a small invoice table:
       ```
       <p><strong>Supplier:</strong> ACME Pharma Ltd.</p>
       <p><strong>Invoice #:</strong> INV-2026-00481 · <strong>Date:</strong> 13 Jun 2026</p>
       <table>… 3 rows: Napa Extend 650mg ×2, Sergel 20mg ×5, Seclo 20mg ×3 …</table>
       <p><strong>Total:</strong> ৳ 1,240</p>
       ```
     - `prescription` / `photo` → `BlockChecklist` with mock items:
       `Napa Extend 665mg — 2 Boxes`, `Sergel 20mg — 1 Strip`, `Monas 10mg — 1 Box`, `Seclo 20mg — 2 Strips`.
  4. Insert the new block **immediately after the source image** (not appended to end) — add a new helper `insertBlockAfter(afterId, block)` modelled after `addBlockWithCursor` but splicing at `idx+1` and queueing a trailing empty text block + focus.
  5. Respect 2000-char ceiling: compute the character cost of the mock block; if it would overflow, abort and `toast.warning("Not enough space — approaching 2000 character limit")`.
  6. `hasContentRef.current = true` is already kept in sync via the existing `hasContent` memo since the draft updates.
  7. Clear `scanningBlockId`, `toast.success("MediNist AI extracted N items")`.

- Pass `onScan={() => handleScanImage(block)}` and `scanning={scanningBlockId === block.id}` to `<BlockImage>`.

---

## 2. AI Text Assistant — Magic Wand in Toolbar

### New components
- `src/components/notes/AIActionSheet.tsx` — Vaul `Drawer` with glassmorphic header.
- `src/components/notes/AIProgressPill.tsx` — floating bottom pill shown while a mock action runs.

### Toolbar change (`NoteKeyboardToolbar.tsx`)
- Add a new `Sparkles`/`Wand2` icon button to the **left group**, placed between the `Type` (text format) button and the flex spacer — naturally where the thumb rests.
- Style: same `iconBtn` shape but with `text-indigo-600` and a tiny `bg-gradient-to-br from-indigo-50 to-violet-50` chip background to read as "premium".
- New prop `onOpenAI: () => void`.

### AIActionSheet
- Drawer with glass header: `bg-white/70 backdrop-blur-xl border-b`, title `MediNist AI Assistant`, subtitle `Choose an action to enhance your note`.
- Body: 3 stacked tiles (full-width cards). Each tile = leading rounded gradient icon square + title + description + chevron.
  1. `Sparkles` indigo — **Smart Clean & Format** — "Transforms messy, rapid shop notes into a highly professional, structured digital memo."
  2. `Languages` emerald — **Translate to English** — "Instantly translates local language notes into international English formats."
  3. `ListChecks` amber — **Extract Action Items** — "Scans your text and automatically extracts a checklist of pending actions/tasks."
- Tap → close drawer, call `onAction(actionId)`.

### AIProgressPill
- Fixed `bottom-20 left-1/2 -translate-x-1/2 z-40`, pill shape with `bg-gradient-to-r from-indigo-600 to-violet-600 text-white`, soft glow ring (`shadow-[0_0_24px_rgba(99,102,241,0.5)]`), `Sparkles` icon spinning slowly, label `✨ MediNist AI is optimizing your note...`, fade-in animation.

### Wiring in `NoteEditor.tsx`
- State: `aiSheetOpen`, `aiProcessing` (bool).
- `handleAIAction(action)`:
  1. `setAiSheetOpen(false)`; `setAiProcessing(true)`.
  2. Collect plain text from all `text` blocks: `draftRef.current.content.filter(text).map(stripHtml).join('\n')`.
  3. Mock 1.4s delay.
  4. Compute mocked result per action:
     - **smart_clean**: if input contains Bangla characters or matches a "rofik/napa/taka" pattern, return the literal Customer/Medicine/Status template from the spec; otherwise a generic structured rewrite: `**Summary:** <first line>\n**Details:** <rest joined by " · ">\n**Status:** ✅ Logged`.
     - **translate_en**: replace common Bangla→English phrase map (small dictionary of ~15 entries) and fall back to "[EN] " prefix on any line that wasn't matched.
     - **extract_actions**: split input on sentence boundaries, keep lines containing verbs (`call|order|pay|deliver|check|follow up|নিবে|দিবে|আনবে`), produce a `BlockChecklist` appended after the last text block; respect char budget.
  5. For smart_clean / translate_en → **replace** the first text block's HTML with the result (wrapped in `<p>` lines using `<br>` for newlines, with `<strong>` preserved). Other text blocks left untouched. Char ceiling enforced; if overflow → trim and toast warning.
  6. For extract_actions → call `insertBlockAfter(lastTextBlockId, checklistBlock)`.
  7. `setAiProcessing(false)`; `toast.success("Note optimized by MediNist AI")`.
- Wire toolbar `onOpenAI={() => setAiSheetOpen(true)}`.
- Render `<AIActionSheet open={aiSheetOpen} onOpenChange={setAiSheetOpen} onAction={handleAIAction} />` and `<AIProgressPill show={aiProcessing} />` inside `NoteEditor`.

---

## 3. State Integrity & Constraints

- All mutations go through `setDraft` so existing `draftRef`, `hasContent`, `hasContentRef`, save-on-exit, and realtime updates work unchanged.
- New helper `insertBlockAfter(afterId, block)` reuses the same trailing-text-block + `focusBlockIdRef` pattern as `addBlockWithCursor` (no behavioral change to existing flows).
- A small `estimateBlockChars(block)` helper mirrors the logic in the `totalChars` memo and is used by both AI flows to pre-check the 2000 ceiling. Overflow → standard `toast.warning("Approaching 2000 character limit")` and abort.
- Mobile: all new UI uses existing toolbar / Vaul drawer primitives; tile cards stack vertically (`grid grid-cols-1 gap-2`). Safe-area handled by existing toolbar; pill respects `pb-[env(safe-area-inset-bottom)]`.

---

## Technical changes (files)

- `src/components/notes/blocks/BlockImage.tsx` — add `onScan`, `scanning` props, scan button + laser overlay.
- `src/components/notes/NoteKeyboardToolbar.tsx` — add `onOpenAI` prop and Wand button.
- `src/components/notes/AIActionSheet.tsx` — **new**, Vaul drawer with 3 tiles.
- `src/components/notes/AIProgressPill.tsx` — **new**, floating progress pill.
- `src/pages/NoteEditor.tsx` — `scanningBlockId`, `aiSheetOpen`, `aiProcessing` state, `handleScanImage`, `handleAIAction`, `insertBlockAfter`, `estimateBlockChars`; pass new props to `BlockImage` + toolbar; render sheet + pill.
- `tailwind.config.ts` — add `scanner-sweep` keyframe + animation utility.

No DB, RLS, edge function, or `useNotes` hook changes. No new dependencies (Sparkles/Wand2/Languages/ListChecks already in lucide-react; Vaul drawer already in use).
