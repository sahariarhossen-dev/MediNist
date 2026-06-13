## Fix expanded cart item Row 2 — lock the qty stepper, let the left data shrink

Single, scoped edit in `src/pages/CreateSale.tsx` (lines ~656–724). Row 1 (brand/strength/badge/MRP) and Row 3 (wholesale calc) are not changed.

### Problem

Row 2 currently puts trash + stk label + retail calc + qty stepper into one flex row with `flex-nowrap` and `whitespace-nowrap` on the calc string. With the new `stk 0:1:0 / 10` label, the retail calc (`10*25.00=250.00৳`) keeps its full width and the qty stepper (`- 10 +`) gets pushed past the right edge on narrow phones.

### New structure

Row 2 becomes a strict two-child flex:

```text
[ left group: shrinkable ............................ ] [ stepper: locked ]
```

- Outer: `flex flex-row justify-between items-center w-full mt-2 gap-2`
- Left group: `flex items-center gap-1.5 min-w-0 flex-1 flex-wrap` containing
  - Trash button (`flex-shrink-0`)
  - `stk …` label — drop `whitespace-nowrap`, keep `font-mono text-[10px]`, add `truncate` is wrong here (we want wrap), so allow natural wrap by removing nowrap only.
  - Retail calc string (when `!isWholesale`) — same: remove `whitespace-nowrap` and `ml-auto`, allow it to wrap to a second line under the stk label when space is tight.
  - Wholesale discount input stays in the left group with `flex-shrink-0`.
- Right group (stepper): unchanged markup, but wrapped/classed as `flex-shrink-0` (already has it) and the parent's `justify-between` keeps it pinned to the right edge.

Net effect: on narrow viewports the left side wraps (stk on line 1, calc on line 2) while the stepper stays fully visible and right-aligned. On wider phones everything fits on one line as before.

### Out of scope

- Row 1 layout, Row 3 wholesale calc strip, collapsed card, and all calculation logic remain untouched.
- No changes to types, hooks, or other components.
