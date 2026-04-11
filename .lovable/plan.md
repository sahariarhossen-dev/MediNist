

## Plan: Fix Mobile UI Overlapping with Smart Truncation & Responsive Layout

### Problem
On small screens (390px wide), product names and strengths overflow into stock/calculation areas, causing text overlap and broken layouts across CreateSale, Inventory, and ShortItems pages.

### Solution

**1. Create a reusable truncation utility (`src/lib/formatUtils.ts`)**

A helper function that truncates product name to 10 chars and strength to 8 chars with ellipsis:
```
truncateName("Napa Extend", 10) → "Napa Exten…"
truncateStrength("500 mg/5ml", 8) → "500 mg/5…"
```

**2. Update `src/pages/CreateSale.tsx`**

- **Search results**: Apply truncation to product name (10 chars) and strength (8 chars)
- **Expanded card (Row 1)**: Truncate name + strength; use `flex-nowrap` and proper `gap-x-2` spacing so name, MRP, and company don't merge
- **Expanded card (Row 2)**: Add `flex-nowrap` to the trash/stk/discount/qty row; reduce padding on stk label; use `text-xs` for secondary labels; remove hardcoded `mx-[25px]` and `mx-[10px]` margins in favor of fluid `gap-2`
- **Collapsed card**: Truncate name + strength; ensure calculation string and total have `flex-shrink-0` with proper gaps
- **Summary section**: Replace `mx-[35px]` with responsive padding

**3. Update `src/pages/Inventory.tsx`**

- Truncate product name (10 chars) and strength (8 chars) in medicine cards
- Use `text-xs` for company name on small screens
- Ensure the expanded stock input area uses `flex-nowrap`

**4. Update `src/pages/ShortItems.tsx`**

- Apply truncation to product name and strength in the table rows
- Ensure table columns don't overflow on small screens

**5. Remove hardcoded pixel margins**

Replace all `mx-[Npx]` spacings with responsive Tailwind utilities (`gap-1`, `gap-2`, `ml-auto`) across all three files. This allows the layout to scale fluidly on any screen width.

### Files Modified
- `src/lib/formatUtils.ts` (new — truncation helpers)
- `src/pages/CreateSale.tsx` (truncation + responsive flex fixes)
- `src/pages/Inventory.tsx` (truncation + responsive fixes)
- `src/pages/ShortItems.tsx` (truncation in table cells)

### No database changes needed

