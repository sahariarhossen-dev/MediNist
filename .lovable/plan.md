## Goal
Elevate the Notepad module from a Keep-style clone to a premium SaaS aesthetic (Notion / Apple Notes / ChatGPT mobile). Pure presentational refactor — no business logic, data, or AI behavior changes.

## Scope (files to edit)
1. `src/components/notes/ColorPicker.tsx` — replace `colorHex()` hex map with a `colorClasses()` helper returning the new tint Tailwind classes (white + 5–10% opacity tints, dark-mode pairs). Keep `colorHex` exported as a thin shim (returns `"transparent"`) so callers that still inline `style={{ backgroundColor }}` don't break, but we'll migrate those call sites to `colorClasses()`.
2. `src/components/notes/NoteCard.tsx` — full visual rewrite per spec.
3. `src/pages/Notes.tsx` — swap card container background to `bg-slate-50 dark:bg-slate-950` for the new palette to read correctly; pass shared/reminder/avatar data to `NoteCard`.
4. `src/components/notes/blocks/BlockChecklist.tsx` — remove the bordered container, restyle rows as borderless inputs with bottom-border-only and indigo focus, restyle checkboxes.
5. `src/pages/NoteEditor.tsx`
   - Glassmorphic header (`bg-white/80 backdrop-blur-md border-b border-slate-100/80`).
   - Title input → `text-2xl font-bold tracking-tight ...`.
   - Editor container → `max-w-2xl mx-auto px-4 pt-6 pb-32`.
   - Remove inline color background from page wrapper (now handled by `Notes.tsx` page bg + card tints inside editor stay neutral white for focus).
   - Move the character counter out of the document flow into a `fixed bottom-[88px] right-4 z-30` pill above the floating toolbar, using the spec'd mono micro-typography.

## Section 1 — NoteCard (dashboard)

```tsx
// container
<button className="
  group mb-2 w-full text-left break-inside-avoid
  rounded-2xl border border-slate-100 dark:border-slate-800/60
  shadow-[0_2px_8px_rgba(15,23,42,0.03),0_1px_3px_rgba(15,23,42,0.02)]
  hover:shadow-[0_4px_16px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.03)]
  transition-all duration-200
  p-4 flex flex-col
  {tintClass}
">
```

Color tint map (added to `ColorPicker.tsx`):
```
default → bg-white dark:bg-slate-900
green   → bg-emerald-50/40 dark:bg-emerald-950/20
blue    → bg-indigo-50/40 dark:bg-indigo-950/20
purple  → bg-purple-50/40 dark:bg-purple-950/20
yellow  → bg-amber-50/40 dark:bg-amber-950/20
pink    → bg-rose-50/40 dark:bg-rose-950/20
red     → bg-rose-50/40 dark:bg-rose-950/20
```

Title:
```
font-semibold text-slate-900 dark:text-slate-100 tracking-tight
text-[15px] mb-1.5 line-clamp-1
```

Body snippet:
```
text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal line-clamp-3
```

Pin/shared icons in top-right corner keep current position but switch to `text-slate-400` / `text-amber-500`.

Image preview grid: keep, but switch to `rounded-lg` and tighter gap.

Bottom metadata row (only rendered if any badges/byline exist):
```tsx
<div className="flex flex-wrap items-center gap-1.5 pt-3 mt-auto
                border-t border-slate-100/50 dark:border-slate-800/40">
  {reminder_at && <ReminderPill iso={...} />}
  {is_public && <SharedPill />}
  {!isMine && creatorName && <CreatorByline name={creatorName} />}
</div>
```

Reminder pill:
```
bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400
text-[10px] font-medium px-2 py-0.5 rounded-full
flex items-center gap-1
→ <Clock size={10} /> Today, 5:00 PM
```

Shared pill:
```
bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400
text-[10px] font-medium px-2 py-0.5 rounded-full
flex items-center gap-1
→ <Users size={10} /> Shared
```

Creator byline (initial avatar + name):
```tsx
<span className="flex items-center gap-1.5 text-[10px] text-slate-400 ml-auto">
  <span className="h-[18px] w-[18px] rounded-full bg-slate-100 text-slate-600
                   font-bold text-[9px] flex items-center justify-center">
    {initials(name)}  {/* "Salman F" → "SF" */}
  </span>
  <span className="truncate max-w-[80px]">{name}</span>
</span>
```

Note: `reminder_at` is not yet persisted on `Note` — for now the dashboard reads `note.reminder_at` if present (optional) so the badge lights up the moment the column is added; until then the pill simply doesn't render. No type changes required (use `(note as any).reminder_at` guarded fallback OR extend the `Note` interface with `reminder_at?: string | null`). The plan extends the interface (purely optional field, no migration needed).

## Section 2 — Editor

### A. Checklist (`BlockChecklist.tsx`)
Container goes from `border bg-white/70 rounded-md px-2 py-2` → just `space-y-1 mb-1`.

Each row wrapper:
```
flex items-center gap-3
border-b border-slate-100 focus-within:border-indigo-500/50
py-2.5 transition-all duration-200
```

Replace the shadcn `<Input>` with a borderless input:
```
flex-1 bg-transparent border-0 outline-none focus:ring-0
text-sm text-slate-800 placeholder:text-slate-300
{checked && "line-through text-slate-400"}
```

Checkbox className override:
```
rounded-[4px] border-slate-300 data-[state=checked]:bg-indigo-600
data-[state=checked]:border-indigo-600 focus-visible:ring-indigo-500/30
```

Remove button: only shown on row hover, subtler `text-slate-300 hover:text-rose-500`.

"Add item" button: ghost, `text-indigo-600 hover:bg-indigo-50/60 h-8 mt-1`.

### B. Editor header & layout (`NoteEditor.tsx`)
Page wrapper loses the dynamic color background:
```tsx
<div className="min-h-screen w-full bg-white">
```

Header:
```tsx
<header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md
                   border-b border-slate-100/80 px-3 py-2.5
                   flex items-center gap-2">
```
Back button: `p-2 rounded-full hover:bg-slate-100 text-slate-600`.

Inner editor scroll wrapper:
```tsx
<KeyboardAvoidingScroll
  className="min-h-screen overflow-y-auto"
  bottomPadding={120}
>
  <div className="max-w-2xl mx-auto px-4 pt-6 pb-32 flex flex-col gap-1">
    {/* title + blocks */}
  </div>
</KeyboardAvoidingScroll>
```

Title input:
```
w-full text-2xl font-bold tracking-tight text-slate-900
placeholder:text-slate-300 bg-transparent border-none outline-none
focus:ring-0 px-0 pb-4
```

### C. Character counter — repositioned
Remove the inline counter block at lines 849-861. Add a fixed pill rendered as a sibling of the toolbar (outside `KeyboardAvoidingScroll`):
```tsx
{!readOnly && (
  <div
    aria-live="polite"
    className="fixed right-4 bottom-[88px] z-30 pointer-events-none"
    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
  >
    <span className={cn(
      "text-[10px] font-mono font-medium tracking-wider",
      "bg-slate-50/80 backdrop-blur px-2 py-0.5 rounded-md",
      "border border-slate-100",
      totalChars >= NEAR_LIMIT ? "text-rose-500" : "text-slate-400",
    )}>
      {totalChars}/{MAX_CHARS}
    </span>
  </div>
)}
```
`bottom-[88px]` clears the existing `NoteKeyboardToolbar` (which sits ~72 px tall + safe-area). If the toolbar height changes we'll bump this value; counter is `pointer-events-none` so it never blocks taps.

## What is NOT changing
- `useNotes` hook, edge functions, mention engine, reminder drawer logic, AI sheet, image upload pipeline, save/sync, keyboard toolbar layout, routing.
- Color tokens in `index.css` (the new tints are pure Tailwind utilities; no token additions needed).
- Dark mode toggle plumbing — classes are added so the redesign is dark-ready when a `dark` class lands on `<html>`, but we don't wire up a switcher.

## Acceptance check
- Dashboard cards render with white/tinted-5–10 % backgrounds, `rounded-2xl`, micro-shadow; titles `line-clamp-1`, snippets `line-clamp-3`.
- Bottom row shows reminder pill, shared pill, and avatar+name byline as applicable.
- Editor header is glassmorphic; title large/bold; checklist rows borderless with bottom border + indigo focus; counter is a fixed mono pill at bottom-right above the toolbar and no longer appears inline.
