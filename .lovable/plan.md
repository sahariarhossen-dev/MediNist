
# Google Keep–style Notepad + Realtime Sync

The Smart Notepad backend, editor, blocks, sharing, color coding, pinning, search, and storage are already built and working. This plan focuses on the **two missing pieces** the user is asking for:

1. A pixel-faithful **Google Keep visual redesign** of the main Notes screen.
2. **Supabase Realtime** so a salesman's "Shortage" note pops into the admin's grid instantly.

We are NOT rebuilding the editor, schema, RLS, storage, or block system — those already match the brief.

---

## 1. Visual redesign of `src/pages/Notes.tsx` (Keep look)

Reshape the top bar and grid to match the uploaded Keep screenshot, while keeping our brand blue `#2563eb` for accents.

**Top bar (sticky, single row, pill-shaped):**
- Hamburger menu icon (left) — opens a slide-in `Sheet` drawer.
- Rounded pill search input that fills remaining width — light gray bg in light mode, placeholder "Search your notes".
- View-toggle icon (single-column / masonry) on the right inside the pill.
- Circular profile avatar at far right (uses `profile.avatar_url`, falls back to initial).
- Removes the current "back arrow + title + filter chips row" stack — Keep has none of that. Filters move into the drawer.

**Drawer menu (new `NotesMenu.tsx` using existing `Sheet` component):**
- Header: "MediNist Notes" with logo.
- Items (each toggles the active filter): All notes, Pinned, Mine, Shared with team.
- Footer: link back to More.
- This replaces the inline filter chips currently above the grid.

**Grid:**
- Masonry stays (`columns-2 md:columns-3`), but tighten spacing to `gap-2` and card radius to `rounded-xl` to match Keep.
- Empty state gets a Keep-style centered lightbulb icon + "Notes you add appear here".

**FAB:**
- Keep position `fixed bottom-6 right-6`, but use Keep's pill-shape look: larger (`h-14 w-14`), white bg with subtle shadow, blue `+` icon (instead of solid blue bg) — matches the latest Keep design shown in the screenshot.

**Card refinements (`NoteCard.tsx`):**
- Slightly larger title, tighter body, remove the dotted footer divider — Keep cards are borderless internally.
- "Shared" pill stays but moves to top-right next to pin (small `Users` icon only, no text on mobile).
- Image previews already render — keep current 2×2 thumb grid.

---

## 2. Supabase Realtime sync

Add live updates so any insert/update/delete on `notes` is reflected immediately in every open client of the same pharmacy.

**Edit `src/hooks/useNotes.ts`:**
- New hook `useNotesRealtime()` that subscribes to the `notes` table via `supabase.channel('notes-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, ...)`.
- On any change event, call `queryClient.invalidateQueries({ queryKey: ['notes'] })` (and the specific `['notes', id]` key for UPDATE/DELETE).
- RLS already filters server-side so each user only receives events for rows they're allowed to see (their own notes + shared notes in their pharmacy). No extra filter needed.
- Cleanup `supabase.removeChannel(channel)` on unmount.

**Migration (SQL):**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;`
- `ALTER TABLE public.notes REPLICA IDENTITY FULL;` (so UPDATE payloads include all columns).

**Wire it up:**
- Call `useNotesRealtime()` once at the top of `src/pages/Notes.tsx`.
- React Query refetch is debounced naturally; no toast spam.

---

## 3. Files to change

```text
src/pages/Notes.tsx                  redesign top bar, grid, FAB; mount realtime hook
src/components/notes/NoteCard.tsx    tighten styling to match Keep
src/components/notes/NoteSearchBar.tsx  pill style, hamburger + avatar slots
src/components/notes/NotesMenu.tsx   NEW — drawer with filter items
src/hooks/useNotes.ts                add useNotesRealtime hook
supabase/migrations/<new>.sql        enable realtime publication on notes
```

No changes to: `NoteEditor.tsx`, blocks, `notesStorage.ts`, RLS policies, schema columns, `App.tsx` routes, `More.tsx` entry.

---

## 4. Out of scope (already done in earlier turn — confirmed)
- `notes` table, RLS (private + shared by `is_public`), storage bucket, block content (text / checklist / image with invoice/Rx/photo categories), color coding, pinning, search by content/tags/creator, contact-number `tel:` chips, mobile responsiveness, brand color `#2563eb`, AI-readable `content` + `image_metadata` JSON.
