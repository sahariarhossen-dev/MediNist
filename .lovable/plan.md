## Smart Notepad for MediNist

A new "Notepad" section accessible from the More page, with a Google Keep-style masonry grid, multi-format note editor, pin/color coding, search, and per-note privacy (private by default, optional Shared with Team).

### 1. Database (Supabase migration)

Create two tables in the `public` schema:

**`notes`**
- `id` uuid PK
- `pharmacy_id` uuid (NOT NULL) — used as `shop_id` for sharing
- `creator_id` uuid (NOT NULL) — references `auth.uid()`
- `title` text
- `content` jsonb NOT NULL DEFAULT `'[]'` — array of typed blocks (see schema below)
- `contact_numbers` text[] DEFAULT `'{}'` — clickable phones
- `tags` text[] DEFAULT `'{}'`
- `color` text DEFAULT `'default'` — one of: default, red, yellow, green, blue, purple, pink
- `is_pinned` boolean DEFAULT false
- `is_public` boolean DEFAULT false — the Shared-with-Team toggle
- `image_metadata` jsonb DEFAULT `'{}'` — AI-friendly summary of attached images (urls, type: invoice/prescription/photo, ocr_text placeholder)
- `created_at` / `updated_at` timestamptz with `touch_updated_at` trigger

**`note_blocks` content shape (stored in `content` jsonb):**
```
[
  { "id": "...", "type": "text",      "html": "..." },
  { "id": "...", "type": "checklist", "items": [{ "text": "...", "checked": false }] },
  { "id": "...", "type": "image",     "url": "...", "caption": "...", "category": "invoice|prescription|photo" }
]
```

**RLS policies on `notes`:**
- SELECT: `creator_id = auth.uid() OR (pharmacy_id = get_user_pharmacy_id() AND is_public = true)`
- INSERT: `creator_id = auth.uid() AND pharmacy_id = get_user_pharmacy_id()`
- UPDATE: `creator_id = auth.uid()` (only creator edits)
- DELETE: `creator_id = auth.uid() OR is_pharmacy_admin()`

**Storage bucket `note-attachments`** (public read, authenticated write). Path layout: `{pharmacy_id}/{note_id}/{uuid}.{ext}`. Storage RLS:
- INSERT/UPDATE/DELETE: only when first folder = user's `pharmacy_id` AND user is authenticated
- SELECT: public (so shared notes render images cross-user)

**View for search-by-creator:** add a security-definer SQL function `get_pharmacy_member_names()` returning `{user_id, full_name}` for current user's pharmacy so we can filter notes by creator name without exposing full profiles.

### 2. Routes & Navigation

- New route `/more/notes` → `Notes.tsx` (list/grid view)
- New route `/more/notes/:id` → `NoteEditor.tsx` (open existing or `new` for creation)
- Add "Smart Notepad" entry in `src/pages/More.tsx` menu (StickyNote icon, brand blue)
- Add "Notes" route registrations in `src/App.tsx`

### 3. Pages & Components

**`src/pages/Notes.tsx`** — Keep-style grid
- AppHeader + sticky search bar (filters: text, tag, creator name)
- Filter chips: All / Pinned / Mine / Shared / by color
- Masonry grid: 1 col on mobile (<480px), 2 cols on sm, 3 cols on md+ — using CSS columns for true masonry
- Each card: title, content preview (text + checklist progress + image thumbs + contact chips), pin indicator, color background, "Shared" badge if public, creator avatar (only for shared notes from others)
- Floating "+" FAB (brand `#2563eb`) → navigates to `/more/notes/new`

**`src/pages/NoteEditor.tsx`** — full-screen editor
- Top bar: back, pin toggle, color picker popover, Shared-with-Team Switch, delete (creator only), save state indicator (autosave on blur + debounce)
- Title input
- Block list (re-orderable later, MVP additive):
  - Add block toolbar: Text, Checklist, Image, Invoice photo (image with category=invoice), Prescription photo (image with category=prescription)
  - Text block: contentEditable rich text (bold/italic/list via simple toolbar)
  - Checklist block: list of items with checkbox + text + add/remove
  - Image block: shows uploaded image + caption + category badge; tap to view full-screen
- Contact Numbers section: chips of phone numbers, each with `<a href="tel:...">` to call; add/remove input
- Tags input (comma-separated chips)
- KeyboardAvoidingScroll wrapper (existing) so editor stays usable with keyboard open
- Read-only mode when current user is not the creator (shared note)

**Reusable components in `src/components/notes/`:**
- `NoteCard.tsx` — grid card
- `BlockText.tsx`, `BlockChecklist.tsx`, `BlockImage.tsx`
- `ColorPicker.tsx` — 7 swatches mapped to Tailwind classes
- `ContactChips.tsx`
- `NoteSearchBar.tsx`

### 4. Visibility & Privacy Logic

- `is_public` defaults to `false` (Private). Toggle in editor flips it.
- Backend enforcement via the RLS SELECT policy described above. Frontend simply queries `notes` and Supabase returns the union of own + shared.
- Shared notes from other users are visually marked with a "Shared by {name}" footer and are read-only.

### 5. AI-Ready Data Shape

- `content` is structured JSON (block types) → easy for an agent to walk and summarise.
- `image_metadata` stores `{ urls: [...], categories: [...], ocr_text: null }` so a future Edge Function can populate OCR/insights without schema changes.
- A future `ai-chat` tool can read `notes` rows directly; no migration needed later.

### 6. UI / Styling

- Brand colour `#2563eb` for primary actions, FAB, active filter chips, links.
- Note card colour palette uses soft pastel backgrounds (Tailwind: `bg-red-50`, `bg-amber-50`, `bg-emerald-50`, `bg-sky-50`, `bg-violet-50`, `bg-pink-50`, `bg-white`) with matching border accents.
- 100% mobile-responsive — uses existing `max-w-md` mobile container on small screens, expands to wider grid on `sm:` and `md:` breakpoints by removing the max-width on `/more/notes` only.
- Reuses `KeyboardAvoidingScroll`, `Sheet`, `Switch`, `Input`, `Textarea`, `Button` from existing UI kit.

### 7. Files to create

```
supabase migration: create notes table, RLS, storage bucket + policies, helper function
src/pages/Notes.tsx
src/pages/NoteEditor.tsx
src/components/notes/NoteCard.tsx
src/components/notes/NoteSearchBar.tsx
src/components/notes/ColorPicker.tsx
src/components/notes/ContactChips.tsx
src/components/notes/blocks/BlockText.tsx
src/components/notes/blocks/BlockChecklist.tsx
src/components/notes/blocks/BlockImage.tsx
src/hooks/useNotes.ts          (React Query: list/get/create/update/delete + search filters)
src/lib/notesStorage.ts        (upload/delete attachments helpers)
```

### 8. Files to modify

- `src/App.tsx` — register `/more/notes` and `/more/notes/:id` routes
- `src/pages/More.tsx` — add "Smart Notepad" menu entry

### 9. Out of scope (future)

- Real-time collaboration / presence
- Block re-ordering by drag
- AI summaries (data shape is ready; UI/edge function not built)
- Per-user share targeting (only pharmacy-wide for now)
