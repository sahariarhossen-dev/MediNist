

## Plan: Fully Fluid Responsive Design Fix

### Problem
- Table columns in ShortItems have no width constraints, causing overlap on narrow screens
- Long product names push other columns off-screen
- Fixed `w-[140px]` on the company select trigger
- `max-w-md` is fine for centering but internal elements need fluid sizing

### Changes

**File: `src/pages/ShortItems.tsx`**

1. **Table layout**: Add `table-fixed` class to the `<table>` element so columns respect assigned widths
2. **Column widths**: Apply percentage-based widths via `w-[40%]`, `w-[20%]`, `w-[18%]`, `w-[22%]` on `<th>` elements for Product, Category, STK, Price respectively
3. **Text truncation**: Add `truncate max-w-0` on the Product and Category `<td>` cells so long names get ellipsis instead of wrapping
4. **Reduce padding**: Change `px-4` to `px-2` on outer columns, use `px-1.5` on inner columns for tighter spacing on small screens
5. **Company select**: Replace `w-[140px]` with `w-auto max-w-[40vw]` so it scales with screen width
6. **Font scaling**: Use `text-[13px]` for table body instead of `text-sm` to fit more content; keep `text-xs` for headers

**No other pages are modified** — the user specifically asked about Short Items. The same pattern can be applied to other table/list pages later.

### Technical Details
- `table-fixed` + percentage widths ensures columns never exceed their allocation regardless of content length
- `truncate` applies `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- `max-w-0` on `<td>` is a common trick to make `truncate` work inside table cells with `table-fixed`
- The `max-w-md` wrapper is kept — it correctly constrains the app to phone-width on desktop while being `w-full` on actual phones

