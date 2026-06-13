# Phase 3 — Collaboration & Reminders (Frontend)

Frontend-only build. No DB/edge changes yet. State stays in `DraftState`/`draftRef` so the existing save-on-exit pipeline will sync once we add columns later.

## 1. New components

### `src/components/notes/MentionPopover.tsx`
- Floating list anchored above the caret (absolute-positioned div at `{top, left}` from `Selection.getRangeAt(0).getBoundingClientRect()`).
- Props: `query: string`, `members: PharmacyMember[]`, `position: {top,left} | null`, `activeIndex`, `onPick(member)`, `onClose()`.
- Renders max 6 filtered members (case-insensitive `full_name` startsWith → includes fallback), each row: avatar circle (initial), name, role hint.
- Selected row has indigo-50 bg. Keyboard hint footer ("↑↓ Enter ⎋").
- Empty state: "No staff matching '@xxx'".
- Pure presentational — caller owns state.

### `src/components/notes/ReminderDrawer.tsx`
- Uses `Drawer` (vaul) from `@/components/ui/drawer`.
- Title: "Set Note Reminder".
- 3 preset tiles (rounded-2xl, soft gradient, icon left, label + computed timestamp right):
  1. 🌇 Later Today → today 17:00
  2. 🌅 Tomorrow Morning → tomorrow 09:00
  3. 📅 Pick Custom → reveals inline `<input type="datetime-local">` + "Set Reminder" primary button.
- Disables "Later Today" preset if 17:00 already passed.
- `onSave(iso: string)` closes drawer. `onClear()` option visible if a reminder already exists.
- Safe-area pb via `env(safe-area-inset-bottom)`.

### `src/components/notes/ReminderBadge.tsx`
- Amber chip: `bg-amber-50 text-amber-800 border border-amber-200` rounded-full, clock icon left, formatted label center, `X` button right.
- Formatter: same-day → "Today, 5:00 PM"; tomorrow → "Tomorrow, 9:00 AM"; else → "15 Jun, 09:00 AM".
- Props: `iso`, `onClear`.

## 2. Mention engine — shared hook `src/hooks/useMentionTrigger.ts`
Encapsulates detection so both BlockText and BlockChecklist can use it:
- Exposes `{ query, position, open, onKeyDown, reset, attach }`.
- `attach(el)`: listens to `input`/`keyup`/`selectionchange` on the element.
- Detects `@` token by walking back from caret offset until whitespace/start; opens popover when token starts with `@` and has 0-30 chars after.
- Computes popover position from caret rect (with viewport clamp).
- `onKeyDown` handles ArrowUp/Down (rotates `activeIndex` via callback), Enter (calls `onPick`), Escape (resets).

NoteEditor owns the singleton `MentionPopover` instance + the `usePharmacyMembers()` fetch (cached by React Query). It passes a shared `onMentionInsert(blockId, member)` callback down to each block; the active block id is tracked on focus.

### Insertion format
Inline span injected at caret, replacing the `@query` token:
```html
<span class="mention" data-user-id="UUID" contenteditable="false">@Rahman</span>&nbsp;
```
Tailwind class `.mention` added to `src/index.css`:
```
.mention { @apply inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md bg-indigo-50 text-indigo-700 text-sm font-medium align-baseline; }
```
- BlockText: uses Range API to delete the `@query` text and insert the chip node, then fires `onChange(innerHTML)` so it flows into `draft.content` via existing path.
- BlockChecklist: since rows use plain `<Input>`, replace the `@query` substring with `@Rahman ` plain text and stash `mentions: [{user_id, name}]` in a parallel item field (extends NoteBlock checklist item with optional `mentions` later; for now we store inline-text + emit a `data-mentions` JSON on the row when rendered). To keep this PR small and avoid touching `NoteBlock` typing, we keep checklist mentions as plain text `@Name` for now; document this limitation. The rich-chip experience lives in BlockText.

State integrity: edits go through existing `updateBlock` → `setDraft` → `draftRef`. No new top-level state for mention text.

## 3. Reminder state
Extend `DraftState` with `reminder_at: string | null` (ISO). Initialise from `existing.reminder_at` if present (currently undefined — guarded with `??`). NOT added to `buildPayload` yet (schema doesn't have the column). A TODO comment marks the line where it should be added once the column is created.

- `NoteEditor` holds `reminderDrawerOpen` state.
- Toolbar Bell click → `setReminderDrawerOpen(true)`.
- On save → `setDraft(d => ({...d, reminder_at: iso}))` and toast.success("Reminder set").
- Badge renders under the title only when `draft.reminder_at` truthy.

## 4. Toolbar update — `src/components/notes/NoteKeyboardToolbar.tsx`
Add new prop `onOpenReminder: () => void` and insert a Bell button **immediately after** the AI wand button (same pill style, amber tint):
```
className="h-10 px-2.5 inline-flex items-center gap-1 rounded-full text-amber-700 bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 ..."
```
Icon: `Bell` from lucide-react, label "Remind".

## 5. NoteEditor wiring (`src/pages/NoteEditor.tsx`)
- Import new components + `usePharmacyMembers`, `Bell`.
- Add `reminderDrawerOpen` state, `activeTextBlockIdRef` updated via `onFocus` on each BlockText.
- Render `<ReminderBadge>` between the Title input and the blocks loop.
- Render `<ReminderDrawer>` and `<MentionPopover>` near the existing `<AIActionSheet>`.
- Pass `onOpenReminder` to the toolbar.

## 6. Responsiveness / safe area
- Drawer already handles safe-area; we add `pb-[env(safe-area-inset-bottom)]` to its footer.
- MentionPopover uses `max-w-[min(280px,calc(100vw-32px))]` and viewport-clamped position.
- Reminder badge wraps via `flex-wrap`.

## Technical notes
- No type changes to `NoteBlock`. Mention chips live inside the existing `html` field of text blocks — re-rendering via `DOMPurify` already allows `<span>` + `data-*` attrs (verify: `USE_PROFILES.html` keeps them; we'll add `ADD_ATTR: ['data-user-id']` to the sanitize call in BlockText).
- Char-budget counter unchanged: text-block mention chips contribute their visible `@Name` characters via the existing `replace(/<[^>]*>/g, "")` strip.
- No new dependencies.

## Files touched
- create `src/components/notes/MentionPopover.tsx`
- create `src/components/notes/ReminderDrawer.tsx`
- create `src/components/notes/ReminderBadge.tsx`
- create `src/hooks/useMentionTrigger.ts`
- edit `src/components/notes/blocks/BlockText.tsx` (attach mention trigger, sanitize allowlist)
- edit `src/components/notes/blocks/BlockChecklist.tsx` (attach mention trigger, plain-text insert)
- edit `src/components/notes/NoteKeyboardToolbar.tsx` (Bell button + prop)
- edit `src/pages/NoteEditor.tsx` (state, render badge/drawer/popover, pass handlers)
- edit `src/index.css` (`.mention` utility)

## Out of scope (Phase 4)
- Persisting `reminder_at` and `mentions[]` to `public.notes`.
- Push/inbox notifications to mentioned users.
- Cron/edge function for reminder firing.