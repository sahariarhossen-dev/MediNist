

## Plan: Clean Up Sales Summary Modal and Chart Scrollbar

### Overview
Two UI cleanups: (1) Strip the modal down to just header + two stat cards, (2) remove the yellow bar and hide the scrollbar while keeping touch/drag scroll.

### Changes

**1. `src/components/SalesTrendChart.tsx`**

**Modal simplification (lines 282-311)**:
- Remove the entire Top Selling Items section (lines 294-310) — the `topItems` list, the "No item data" fallback, and the outer `space-y-4` wrapper
- Modal body becomes just the two-card grid (Total Sales + Invoices)
- Remove `topItems` from `ModalData` interface and the fetching logic (lines 194-212) since it's no longer needed

**Remove yellow scroll bar (line 269)**:
- Delete `<div className="h-1.5 bg-amber-400 rounded-full mt-2" />`

**Hide scrollbar on chart container (line 235)**:
- Add `scrollbar-hide` class (or inline style) to the scroll container to visually hide the scrollbar while keeping `overflow-x: auto` functional

**2. `src/index.css`** — Add scrollbar-hide utility if not already present:
```css
.chart-scroll-container::-webkit-scrollbar { display: none; }
.chart-scroll-container { -ms-overflow-style: none; scrollbar-width: none; }
```

### Files Changed
1. `src/components/SalesTrendChart.tsx` — remove top items section from modal, remove yellow bar, hide scrollbar
2. `src/index.css` — add scrollbar-hide styles for chart container

