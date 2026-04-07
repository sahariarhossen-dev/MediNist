

## Plan: Optimize Sales Item Row Layout for Mobile

### Problem
In the expanded item row, STK and MRP badges sit on the same horizontal line, causing text overlap on narrow screens.

### Changes — `src/pages/CreateSale.tsx` (lines 410-443)

**Restructure the second row (below product name) into two rows:**

**Row 1 (left side):** Delete button + STK badge taking full width
- Remove MRP from this line
- STK badge gets remaining space with `flex-1` and `whitespace-nowrap`

**Row 2:** Left side shows the calculation chip (`1×320=320৳`), right side shows MRP label stacked above the quantity selector

**New layout structure:**
```text
┌──────────────────────────────────┐
│ 💊 osmolax  Syrup      CompanyX │
│ 🗑 STK 5 : 0 : 0                │
│ 1×320=320৳          MRP 320     │
│                      [- 1 +]    │
└──────────────────────────────────┘
```

**Specific implementation:**
1. Replace the single flex row (lines 410-443) with a vertical stack (`flex flex-col gap-1.5 mt-2`)
2. **First row:** `flex items-center gap-2` — trash button + STK label (with `flex-1 whitespace-nowrap`)
3. **Second row:** `flex items-center justify-between` — left: calculation chip, right: a `flex flex-col items-end gap-1` containing MRP label on top and quantity selector below
4. MRP styled as `text-[10px] text-primary font-medium`
5. All vertical alignment centers within each sub-row

### Files Modified
- `src/pages/CreateSale.tsx` — restructure expanded item row layout

