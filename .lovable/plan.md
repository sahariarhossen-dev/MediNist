# Phase 3: Long-Press Message → MediNist Note Bridge

Connect the chat room to the Notes module so users can long-press (or right-click) a message bubble, open a sleek context menu, and instantly convert the message text into a new actionable note with smart checklist parsing.

## 1. Long-press / context menu on message bubbles

Edit `src/components/messaging/MessageItem.tsx`:

- Wrap the outer bubble container with handlers:
  - Desktop: `onContextMenu` (preventDefault → open menu).
  - Mobile: touch-hold via `onTouchStart` / `onTouchEnd` / `onTouchMove` with a 450ms timer ref. Cancel on move or early release.
- Local state `menuOpen: boolean` controls a shadcn `Sheet` (side="bottom") with `backdrop-blur-sm` overlay class override.
- Sheet content (rounded-t-2xl, p-2, max-w-md mx-auto):
  - Row 1 — **Copy Text** (`Copy` icon, neutral slate styling). Copies `message.content` (skips card sentinels — fall back to a readable summary like "Shared medicine card" when `parseCardPayload` returns non-null) via `navigator.clipboard.writeText`, then toasts "Copied".
  - Row 2 — **✨ Convert to MediNist Note** (`FilePlus` icon, `text-indigo-600 dark:text-indigo-400 font-medium`, subtle indigo-50 hover). Disabled when the message has no usable text (pure image/attachment + no content).
- Card-payload messages: still show the menu; "Convert" uses a textual rendering of the card (e.g. `Medicine: Napa Extend 665mg\nGeneric: Paracetamol\nStock: 24`) so the note has meaningful content.

## 2. Bridge logic — create note from message

New helper `src/lib/messageToNote.ts`:

```ts
export function parseMessageToBlocks(text: string): NoteBlock[]
```

- Split by `\n`.
- Detect list lines via regex `^\s*(?:[-*•]|\d+[.)])\s+(.*)$`.
- If ≥2 consecutive list lines (or any list line) found, emit a single `checklist` block with each list item as `{ id, text, checked: false }`. Non-list lines between/after list items become preceding/following `text` blocks (HTML-escaped, joined with `<br/>`).
- Otherwise return one `text` block with the message text converted to safe HTML (`<br/>` for newlines, escape `<>&`).
- Each block gets a fresh `crypto.randomUUID()` id.

In `MessageItem.tsx`, when "Convert to MediNist Note" is tapped:

1. Call `useCreateNote()` mutation with:
   - `title: \`Task from Chat: ${senderName || "Member"}\``
   - `content: parseMessageToBlocks(plainTextForNote)`
   - other fields default (no tags/contacts, color default, not pinned, not public).
2. On success: close the sheet, fire toast (see §3), navigate happens only from the toast action.
3. On error: `toast.error("Could not save to Notepad")`.

`useCreateNote` already returns the created `Note` row → use `mutateAsync` to get `note.id` for the toast action.

The mutation needs `useAuth` context (pharmacy_id, user.id) which is already wired inside the hook — no changes to `useNotes.ts` required.

## 3. Confirmation toast with [Open Note] action

Use `sonner` (already in project, e.g. `NoteEditor.tsx` imports it):

```ts
toast.success("📝 Message saved as an actionable task in Notepad!", {
  action: {
    label: "Open Note",
    onClick: () => navigate(`/notes/${note.id}`),
  },
  duration: 5000,
});
```

Confirm the project's notes route is `/notes/:id` (matches `NoteEditor`). If the route differs, use the actual path from `App.tsx`.

## 4. Files

**Create:**
- `src/lib/messageToNote.ts` — parser + block builder.

**Edit:**
- `src/components/messaging/MessageItem.tsx` — long-press/context-menu handlers, bottom Sheet UI, copy + convert actions, sonner toast with Open Note action.

**Not touched:** `useNotes.ts`, `NoteEditor.tsx`, `Notes.tsx`, `ChatRoom.tsx`, DB schema, edge functions.

## 5. Technical notes

- Long-press timer must clear on `onTouchEnd`, `onTouchMove` (>10px), `onTouchCancel`, and on unmount.
- Prevent the menu from interfering with link/image taps inside the bubble: only attach handlers to the bubble wrapper, not the inner `<a>`/`<img>`.
- Suppress the synthetic click that follows a long-press by setting a `suppressNextClickRef` and checking it in any future click handler (currently bubbles have none, but future-proof).
- Accessibility: also wire `onKeyDown` for `Shift+F10` / `ContextMenu` key to open the same sheet.
- Mobile-safe area: sheet content uses `pb-[env(safe-area-inset-bottom)]`.

## 6. Out of scope

- No backend changes, no realtime updates to Notes, no message-level "saved" indicator, no multi-select, no forward-to-existing-note.
