

## Plan: Refine Product Item Layout in CreateSale

### Changes in `src/pages/CreateSale.tsx`

**1. Search Results (lines 219-226):**
- Medicine name + product_type on same line: name bold, product_type as small superscript-style text to the right
- Below that line: show `company_name` (where product_type used to be) + STK indicator

**2. Cart Items (lines 263-267):**
- Medicine name + product_type on same line (same superscript style)
- Below: show `company_name` instead of product_type

### Specific Layout

**Search result item:**
```
[icon]  Medicine Name  Tablet        MRP-7
        Company Name · STK - 50
```

**Cart item (collapsed):**
```
1 [icon]  Medicine Name  Tablet    1*10  7 ৳
          Company Name
```

Product type uses `text-[10px] font-semibold text-orange-600` inline next to the bold name. Company name uses `text-[10px] text-gray-400`.

No other changes — search clear icon, expand/collapse, quantity controls, footer all remain as-is.

