## Force the expanded cart item Row 2 onto a single, fluid line

Single scoped edit in `src/pages/CreateSale.tsx` (lines ~656–724). Row 1, Row 3, the collapsed card, and all calculation logic stay untouched.

### Current problem

The left group uses `flex-wrap` plus `break-all` on the stock/calc strings, so on narrow phones the stock and calc text wrap onto a second line instead of shrinking. The user wants the look from `image_fc855e.png`: trash · stk · calc · — N + all on one line, with the text auto-shrinking before the stepper ever gets pushed.

### New Row 2 structure

```text
[ trash | stk … | calc … ] ........................ [ - N + ]
   fixed   shrinks 1:1     shrinks 2:1            locked (flex-shrink-0)
```

- Outer wrapper: `flex flex-row items-center justify-between w-full mt-2 gap-2 flex-nowrap`
- Left group: `flex items-center gap-1.5 min-w-0 flex-1 flex-nowrap overflow-hidden`
  - Trash button — keep `flex-shrink-0`, unchanged.
  - `stk …` label — `text-[10px] font-mono text-secondary-foreground whitespace-nowrap truncate min-w-0 flex-shrink`. Remove `break-all`. Add `truncate` so any overflow ellipsizes instead of wrapping.
  - Wholesale discount input (when `isWholesale`) — unchanged, stays `flex-shrink-0`.
  - Retail calc string (when `!isWholesale`) — `text-[10px] font-semibold text-emerald-700 whitespace-nowrap truncate min-w-0 flex-shrink`. Remove `break-all`. Allow it to shrink/ellipsize.
- Right group (qty stepper): markup unchanged, keeps `flex-shrink-0`, pinned right by parent `justify-between`.

### Fluid auto-shrink behavior

Because both text spans use `min-w-0` + `truncate` + `whitespace-nowrap` inside a `flex-nowrap` parent, they will:
- Stay on one line on wide phones (full text shown).
- Truncate with ellipsis on narrow phones rather than wrap or push the stepper.

Tailwind has no true `adjustsFontSizeToFit`; truncate-on-shrink is the standard web equivalent and matches the requested "never wrap, never push the stepper" rule. The stepper is locked at its intrinsic width via `flex-shrink-0`.

### Out of scope

- Row 1 header, Row 3 wholesale summary, collapsed card.
- All pricing, stock, and discount calculation logic.
- No other components or hooks are touched.
