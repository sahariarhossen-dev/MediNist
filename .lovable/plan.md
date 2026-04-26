## Goal

Replace the current Note Editor (which shows pre-selected "Add block", "Contact", "Tags", "Shared" cards from the start) with a strictly clean, context-driven editor that mirrors Google Keep:

- Open the editor with **only** a Title field and a Note body field — nothing else.
- All formatting, attachments, color, share toggle, and destructive actions live in a **sticky toolbar pinned above the mobile keyboard**.
- Autosave on Back; the note remains editable after save (no read-only lock for the creator).

## What changes

### 1. Blank creation flow
- `+` FAB on `/more/notes` already routes to `/more/notes/new` — kept as is.
- `NoteEditor.tsx` opens with:
  - Top bar: Back arrow + tiny "Saved/Saving…" status (no pin/color/delete buttons here anymore — they move to the toolbar `⋮`).
  - Title input (large, borderless).
  - A single auto-growing Note textarea (replaces the contentEditable `BlockText`’s toolbar; the per-block format bar is removed in favor of the global keyboard toolbar).
  - No "Add block", "Contact Numbers", "Tags", or "Shared with Team" cards visible up front.

### 2. New `NoteKeyboardToolbar` component (sticky above keyboard)
File: `src/components/notes/NoteKeyboardToolbar.tsx`

Layout (left → right, matching the reference): `＋`  `🎨`  `A`  `↶`  `↷`  `⋮`

- Sits in a `fixed` bar anchored to `bottom: useKeyboardInset()` so it rides above the keyboard. Falls back to `bottom: env(safe-area-inset-bottom)` when keyboard closed.
- Visible only when not read-only.
- Uses `lucide-react` icons: `Plus`, `Palette`, `Type`, `Undo2`, `Redo2`, `MoreVertical`.

Icon behaviors:

| Icon | Action |
|---|---|
| `＋` | Opens a small bottom sheet (`Drawer`) with exactly two options: **Add Image / Invoice** and **Add Checkboxes**. Image option opens the existing file picker (defaults to `photo` category, with quick chips for Invoice/Rx). Checkbox inserts a `checklist` block. |
| `🎨` Palette | Opens a `Popover` above the icon with the existing pastel `ColorPicker` (sets `draft.color`). |
| `A` | Opens a `Popover` with **B / I / U / H1 / H2** buttons that run `document.execCommand` on the focused contentEditable note body. |
| `↶ / ↷` | `document.execCommand('undo' / 'redo')` on the note body; history resets each session (no persistence). Disabled state when there's nothing to undo/redo (best-effort via a small in-memory stack count). |
| `⋮` | `DropdownMenu` with: **Delete**, **Make a copy**, and a **Share with Team** switch row (off = Private by default). Delete confirms then removes; Make a copy creates a new note with the same content and navigates to it. |

### 3. Note body becomes a single rich-text surface
- Replace the multi-block list in the default view with one `contentEditable` div that holds the entire note body (still serialized into a single `text` block in `content[]` for storage compatibility).
- Inserting an image or checklist appends a new block **after** the text block, rendered inline below it (image preview / checklist card). The text block remains the primary editable surface and stays focused after insertion so the keyboard + toolbar stay up.
- Per-block toolbar inside `BlockText.tsx` is removed (formatting now lives in the global `A` popover). `BlockText` becomes a thin contentEditable wrapper.

### 4. Autosave-on-back (and silent debounced save)
- Keep the existing 800 ms debounced autosave to Supabase.
- `handleSaveExit` (Back arrow + Android hardware back via existing `useRootBackHandler` if applicable) calls `ensureSaved()` then `updateMut` then navigates. No "discard" prompt.
- Creator can keep editing after save (current behavior — `readOnly` only true when `existing.creator_id !== user.id`). No change.

### 5. Removed from the editor surface
- The "Add block" grid card.
- The standalone "Shared with Team" card (moved into `⋮` menu).
- The standalone "Contact Numbers" and "Tags" cards. (They remain in the data model and in `NoteCard` previews; they can be re-added later via a "More options" item in the `⋮` menu if requested — flagged as out-of-scope for this pass to keep the screen clean as the user asked.)

### 6. Mobile responsiveness
- Title and note body use `auto`-growing heights (`field-sizing: content` where supported, plus a `useEffect` that sets `style.height = scrollHeight` on input).
- Editor scroll area gets `padding-bottom: 64px + keyboard inset` so the toolbar never overlaps content.
- The toolbar itself is `h-12`, full-width, white background, top border, with `safe-area-inset-bottom` padding.

## File-level changes

- **edit** `src/pages/NoteEditor.tsx` — strip pre-selected sections, mount `<NoteKeyboardToolbar/>`, wire toolbar handlers (color, insert image/checklist, share toggle, delete, copy, format-exec, undo/redo), keep autosave + back behavior.
- **new** `src/components/notes/NoteKeyboardToolbar.tsx` — the sticky toolbar described above.
- **new** `src/components/notes/AddBlockSheet.tsx` — the small `Drawer` opened by `＋` with the two options (Image/Invoice, Checkboxes).
- **new** `src/components/notes/TextFormatPopover.tsx` — B/I/U/H1/H2 buttons calling `document.execCommand`.
- **edit** `src/components/notes/blocks/BlockText.tsx` — drop the local Bold/Italic/List toolbar; expose `onFocus` so the parent knows which editable to target with format/undo commands.
- No DB / RLS / storage changes. No new migrations.

## Out of scope (kept as-is)
- Realtime sync, RLS, storage bucket, `useNotes` hook, `Notes.tsx` grid, FAB, search bar, side menu — all unchanged.
- Tags and contact-number editing UI (data preserved; UI temporarily hidden from the clean editor screen).

## Acceptance check
1. Tap `+` on `/more/notes` → editor opens showing only Title + empty note body + sticky toolbar above the keyboard. No other cards.
2. Type some text → toolbar `＋` becomes meaningful; tapping it shows the two-option sheet.
3. Palette opens pastel swatches; selecting one changes the editor background instantly.
4. `A` opens B/I/U/H1/H2 and applies to selection.
5. Undo/Redo work for the current session; closing/reopening the note clears history.
6. `⋮` shows Delete, Make a copy, and Share-with-Team toggle (off by default).
7. Press Back → status flips to "Saving…" then navigates to the list; reopening shows the same content and remains editable.
