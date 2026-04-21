

## Make MediNist fully fluid & mobile-responsive (320px → tablet)

Goal: every screen flexes from 320px up without horizontal overflow, fonts scale smoothly via `clamp()`, the Short Items table stays single-line and swipe-scrollable, and containers behave like "water in a glass".

### 1. Global fluid typography & spacing tokens (`src/index.css`)

Add a `@layer utilities` block that exposes `clamp()`-based variables so every page picks them up without per-component edits:

```css
:root {
  --fs-xs:   clamp(0.625rem, 1.6vw, 0.75rem);
  --fs-sm:   clamp(0.75rem,  2vw,   0.875rem);
  --fs-base: clamp(0.875rem, 2.4vw, 1rem);
  --fs-lg:   clamp(1rem,     2.8vw, 1.125rem);
  --fs-xl:   clamp(1.125rem, 3.4vw, 1.375rem);
  --fs-2xl:  clamp(1.25rem,  4.2vw, 1.75rem);
  --pad-page: clamp(0.875rem, 4vw, 1.25rem); /* replaces hard-coded px-5 */
}
html { font-size: clamp(14px, 2.6vw, 16px); }   /* fluid root → all rem scale */
body { overflow-x: hidden; }                     /* hard guarantee no h-scroll */
```

Expose them in Tailwind via `tailwind.config.ts` `extend.fontSize` (`'fluid-sm': 'var(--fs-sm)'`, etc.) and `extend.spacing` (`'page': 'var(--pad-page)'`) so we can write `text-fluid-sm` and `px-page` in JSX.

### 2. Container "water" pattern

Today most pages use `max-w-md mx-auto` directly on the page root with `px-5`. We'll standardize:

- Page root: `w-full max-w-md mx-auto px-page` (was `px-5`, fixed 20px).
- Cards/buttons/inputs already inherit width — audit and remove any `w-[Npx]` or `min-w-[Npx]` that breaks ≤320px (notably the 360px-friendly grid in `Index.tsx` summary cards is fine; the FAB's `translate-x-[calc(min(50vw,224px)-1.25rem)]` stays — it already uses `min()`).
- `AppHeader` `px-5` → `px-page`, logo `height={28}` already scales; gap `gap-3` → `gap-2 sm:gap-3`.

### 3. Short Items page — table that never overflows (`src/pages/ShortItems.tsx`)

Current table is `table-fixed` with `%` columns inside a `bg-white` card — it overflows on 320px because the "Product" + "Category" cells have multi-word strings. Fix:

- Wrap `<table>` in `<div className="w-full overflow-x-auto -mx-1 px-1">` so users can swipe horizontally on tiny screens.
- Switch from `table-fixed` w/ percent widths to `min-w-[20rem]` + `whitespace-nowrap` on header cells; let columns size to content.
- **STK column**: add `whitespace-nowrap` so `0 : 4 : 3` always stays on one line. Also wrap the value in a `<span className="tabular-nums">` for clean digit alignment.
- Replace fixed `text-[13px]` / `text-[11px]` with `text-fluid-sm` / `text-fluid-xs`.
- Header row: replace `px-5` page padding with `px-page`; the company `Select` `max-w-[40vw]` becomes `max-w-[45vw] sm:max-w-[14rem]` so it never crowds the title on 320px.

### 4. Daily Transactions & All Transactions feeds

Both render card rows with three columns (icon · text · amount). On 320px the amount can wrap. Fix:

- Amount `<p>` already has `whitespace-nowrap`; add `tabular-nums` and `text-fluid-sm`.
- Middle column already `min-w-0 truncate` ✅.
- Page padding `px-5` → `px-page`; "Daily Closing Summary" card `mx-5` → `mx-page`.
- Summary grid `grid-cols-2 gap-3` stays, but the inner `text-xl` becomes `text-fluid-xl` so big BDT numbers shrink on 320px instead of pushing the card.
- Read-only pill: already fluid ✅.

### 5. Dashboard (`src/pages/Index.tsx`)

- Summary card values `text-xl` → `text-fluid-xl`, labels `text-[11px]` → `text-fluid-xs`.
- Page padding `px-5` → `px-page`. Grid `grid-cols-2 gap-3` is good; on 320px the cards each get ~140px which fits.
- Title `text-lg` → `text-fluid-lg`.

### 6. Sales page (`src/pages/Sales.tsx`)

- "CREATE NEW SALE" hero `text-xl` → `text-fluid-xl`; icon container `w-16 h-16` → `w-14 h-14 sm:w-16 sm:h-16` so it doesn't crowd the heading at 320px.
- `text-3xl` Today's total → `text-fluid-2xl` + `tabular-nums` + `truncate` on its parent column to avoid pushing the sparkline off-screen.
- Sparkline column `w-28` → `w-24 sm:w-28`.
- Page padding `px-5` → `px-page`.

### 7. More page & AppHeader

- `mx-5` → `mx-page`, `px-5` → `px-page`.
- Profile card name/contact already use `truncate min-w-0` ✅. Just swap fixed sizes (`text-base`, `text-sm`, `text-xs`) for fluid equivalents.
- AppHeader: `px-5` → `px-page`; `Bell` icon size 22 stays; on ≤340px, `gap-3` → `gap-2`.

### 8. Bottom nav (`src/components/BottomNav.tsx`)

Already uses `left-4 right-4 max-w-md mx-auto` ✅. Tighten for 320px: `px-2` → `px-1`, label `text-[10px]` → `text-fluid-xs`. No structural change.

### 9. Safety net

Add to `src/index.css`:
```css
img, svg, video { max-width: 100%; height: auto; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```
Apply `.no-scrollbar` to the Short Items table wrapper so the swipe affordance stays clean.

### 10. QA viewports

After the edits we'll spot-check `/`, `/sales`, `/short-items`, `/more`, `/more/daily-transactions`, `/more/all-transactions` at 320×568, 360×800, and 414×896 — checking: no horizontal scrollbar on the page, table swipes only inside its wrapper, STK stays one line, summary numbers don't push siblings.

### Files to edit

- `src/index.css` — fluid CSS vars, root `font-size`, `body { overflow-x:hidden }`, image safety, no-scrollbar util.
- `tailwind.config.ts` — `fontSize` + `spacing` tokens (`fluid-xs/sm/base/lg/xl/2xl`, `page`).
- `src/components/AppHeader.tsx` — fluid padding & gap.
- `src/components/BottomNav.tsx` — fluid label, tighter padding.
- `src/pages/Index.tsx` — fluid title, card text, page padding.
- `src/pages/Sales.tsx` — fluid hero, total, sparkline width.
- `src/pages/More.tsx` — fluid text, page padding.
- `src/pages/DailyTransactions.tsx` — fluid summary, page padding, tabular amounts.
- `src/pages/AllTransactions.tsx` — fluid amounts & padding.
- `src/pages/ShortItems.tsx` — overflow-x wrapper, `whitespace-nowrap` STK, fluid text, drop `table-fixed` percent widths.

No DB, routing, or behavior changes.

