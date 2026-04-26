## Context

The previous turn already removed real-time autosave and implemented save-on-exit in `src/pages/NoteEditor.tsx`. Verified:

- No debounce / `setTimeout` / interval saves remain.
- `updateMut` is only called from `handleBack` and the unmount cleanup (gated by `flushedRef`).
- No "Saving…" / "Saved" indicator in the header (line 391: silent sync).
- 50vh bottom spacer (line 490), `gap-1` flex column (line 409), and 1800/2000 char limits (lines 24–25, 188–196) are all intact.

So requirements 1, 2, 4 and 5 are already done. Only the **checkbox glitch (item 3)** still has a real bug to fix.

## Root cause of the checkbox glitch

`src/components/notes/blocks/BlockChecklist.tsx` renders list items with `key={i}` (array index). When the user presses Enter to insert a new item mid-list, React reuses the existing `<Input>` DOM nodes for shifted positions, which causes:

- the focused input value to appear to "duplicate" into the new row,
- existing items to look like they vanished or merged,
- cursor focus to land on the wrong row.

This is independent of saving — it's purely a React reconciliation issue, which is why removing autosave didn't make it go away.

## Fix

Give each checklist item a stable id and use it as the React `key`.

### Changes to `src/components/notes/blocks/BlockChecklist.tsx`

1. Extend `ChecklistItem` locally with an optional `id: string` (kept optional so existing notes without ids still load).
2. On first render / whenever an incoming item is missing an id, normalize the array by assigning `crypto.randomUUID()` (with the same fallback used in `NoteEditor.tsx`) and push the normalized list back via `onChange`.
3. In `add()` and `insertAfter()`, generate a fresh id for the new row.
4. Change the row `key` from `key={i}` to `key={item.id}`.
5. Keep the `inputsRef` array indexed by position (it already aligns with the rendered order), so Enter / Backspace focus behavior keeps working.

### Type compatibility

`NoteBlock` checklist items are typed in `src/hooks/useNotes.ts`. Add an optional `id?: string` to that item shape so the new field round-trips through Supabase JSON without TypeScript complaints. (The DB column is `jsonb`, so no migration is needed — older notes simply won't have the field until the editor opens them once.)

## Out of scope

- No DB migration.
- No changes to save logic, toolbar, spacer, character counter, or any other file.
- No new UI elements or visible behavior changes — the fix is purely structural so React can correctly track each checkbox row across inserts/removals.
