

## Plan: Redesign Sales Page to Match Reference Layout

### Changes — `src/pages/CreateSale.tsx`

**1. Expanded Product Row Redesign (lines 393-451)**

Replace the current expanded card with a new 3-column grid layout:

```text
┌─────────────────────────────────────────┐
│ sergel 20  capsule   MRP 10  healthcarear│
│ 🗑 stk 11:5:10      10*20=200৳  [- 20 +]│
└─────────────────────────────────────────┘
```

Structure:
- **Line 1**: Three sections in a single flex row
  - Left: Product name (`text-base font-bold`) + product type tag (`text-red-500 text-[11px]`) as superscript
  - Center: `MRP {price}` label (`font-bold`)
  - Right: Company name in teal/emerald color (`text-emerald-600 text-[11px]`)
- **Line 2**: Three sections in a single flex row
  - Left: Red trash icon + `stk X:Y:Z` in gray text
  - Center: Calculation string `{qty}*{price}={total}৳`
  - Right: Quantity controller in a bold rounded-black bordered box (`border-2 border-gray-900 rounded-xl`) with larger `-` / `+` buttons and bold quantity number

- Increase padding to `p-4` for more vertical breathing room
- Trash icon: use `text-red-500` instead of emerald
- Quantity box: `border-2 border-gray-900 rounded-xl`, font-bold quantity text, larger touch targets (`w-8 h-8`)

**2. Collapsed Row (lines 454-475)**

- Add `popular` tag in red below product name (when product_type exists)
- Keep numbering, show `strip_per_pack*pcs_per_strip` info between name and price
- Price right-aligned with `font-bold`

**3. Summary Section Update (lines 481-495)**

- Subtotal line: show individual item totals summed as `{itemTotal1} + {itemTotal2} = {subtotal} ৳`
- Discount and Net Total remain the same
- Net Total value in emerald-600 with larger font

**4. Search Bar (lines 323-343)**

- Replace the search icon section with just a clear `X` button on the right when query exists
- Remove the `Search` icon divider — show `X` only

**5. Footer Buttons (lines 499-515)**

- Add sparkle icon (✦) next to "Complete Sale" text
- Keep existing Draft/Complete styling

### Files Modified
- `src/pages/CreateSale.tsx` — restructure expanded row, update summary display, refine search bar

