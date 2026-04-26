# Note Editor — Document Flow Refactor

Refactor `src/pages/NoteEditor.tsx` and related block components so the editor behaves like a true document (Google Keep / MS Word style) with a tight inline flow, auto-cursoring after inserts, a character-limit guard, and the finalized 6-icon toolbar.

## 1. Document flow layout

Replace the current "primary text + extra blocks below" split with a single ordered list of blocks rendered in `flex flex-col gap-1` (4 px between every block). All block types — text, image, checklist — render inline in insertion order.

- Container: `flex flex-col gap-1 pb-20` on the scroll area (80 px safe zone so the user can scroll past the last line above the keyboard).
- Each text block is a slim `BlockText` with `min-h` reduced (~24 px) so consecutive text/image/checkbox lines sit tight together like a Word document.
- Remove the `space-y-3 mt-4` extra-blocks wrapper and the visual separation between "primary" body and "inserted" blocks.

## 2. Auto-cursor after insertion

When the user inserts an image or checklist via the `+` toolbar:

1. Append the new image/checklist block.
2. Immediately append a fresh empty text block right after it.
3. Focus that new text block on the next animation frame.

Implement by:
- Tracking blocks via `blockRefs: Map<string, BlockTextHandle>` so any text block can be focused by id.
- Updating `addBlock` to take an optional `insertAfter` block id and to auto-append a trailing empty text block when the inserted block is non-text.
- After `setDraft`, `requestAnimationFrame(() => blockRefs.get(newTextId)?.focus())`.

## 3. Character limit (2,000)

Add a derived `totalChars` count across all text blocks (strip HTML) plus checklist item text.

- Counter pill at the bottom-right of the scroll area: `120 / 2000`, `text-xs text-gray-400`, fixed inside the editor (above the toolbar).
- At ≥ 1,800: counter turns `text-red-500`, and a one-shot `toast.warning("Approaching 2000 character limit")` fires (guarded by a ref so it only shows once per session).
- At ≥ 2,000: block further input.
  - In `BlockText.onInput`, if the new total would exceed 2000, revert `el.innerHTML` to the last accepted value and place the caret at the end.
  - Disable the title input's extra characters via `maxLength` calculation (or at least block when total hits limit).
  - Same guard for checklist `Input` `onChange`.

## 4. Toolbar refinement

`NoteKeyboardToolbar` already has the 6-icon two-group layout with a `flex-1` spacer. Cleanup pass:

- Normalize all 6 icon buttons to one shared class (remove ad-hoc `ml-[20px]`, `mr-[10px]`, `bg-gray-100` on the Redo button, and the `bg-gray-100` on the MoreVertical icon).
- Standard button: `h-10 w-10 inline-flex items-center justify-center rounded-full text-gray-700 hover:bg-gray-200 active:bg-gray-300`.
- Container row: `max-w-3xl mx-auto h-12 px-3 flex items-center bg-gray-100`.
- Left group `flex items-center gap-2`, spacer `flex-1`, right group `flex items-center gap-2`.

## 5. Background color applies to entire note immediately

Already wired — `colorHex(draft.color)` is applied as inline `backgroundColor` on the root container, and `setDraft` updates synchronously when the palette is clicked, so the change is instant. Verify and remove the redundant `bg-gray-100` Tailwind class from the root container so it does not flash gray before the inline style paints.

## 6. Performance / debounced save

Already implemented (3 s debounced `updateMut.mutate` reading from `draftRef`). No change needed — confirm that block refactor keeps the debounce intact (the effect depends on `[draft, noteId]`, which still works with the new flat block list).

## Technical details

Files to edit:

- `src/pages/NoteEditor.tsx`
  - Drop `primaryText` split; render `draft.content` as a single ordered list.
  - Add `blockRefs` map, `addBlockAfter`, auto-text-after-insert logic.
  - Add `totalChars` memo, character counter element, near-limit toast guard.
  - Pass `canInsertChars(n)` helper down to `BlockText`, `BlockChecklist`, and the title input.
  - Remove `bg-gray-100` from root container.
  - Change scroll container to `flex flex-col gap-1 pb-20`.
- `src/components/notes/blocks/BlockText.tsx`
  - Accept `onBeforeInput?: (delta: number) => boolean` (or simpler: `maxRemaining: number` from parent) and revert input when exceeded.
  - Reduce `min-h-[160px]` to `min-h-[24px]` so blocks are inline.
  - Keep caret-preserving `lastSetHtmlRef` logic intact.
- `src/components/notes/blocks/BlockChecklist.tsx`
  - Accept and respect remaining-character budget on item text changes.
  - Tighten outer padding so it sits flush with surrounding text blocks.
- `src/components/notes/NoteKeyboardToolbar.tsx`
  - Normalize button classes, remove ad-hoc spacing/colors as listed above.

No database, RLS, or edge function changes.

## Out of scope

- No changes to the notes list page or `NoteCard`.
- No changes to autosave timing (already 3 s).
- No changes to the share/duplicate/delete menu behavior.
