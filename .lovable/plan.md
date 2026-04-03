

## Plan: Redesign Cart Item Layout

### Overview
Redesign each cart item card to show quantity controls inline (always visible, no expand/collapse for qty), with a new info grid and emerald green accents. Remove the expand/collapse pattern entirely — each item is a self-contained card.

### Changes in `src/pages/CreateSale.tsx`

**1. Remove `expanded` state from CartItem interface and `toggleExpand` function**
- Items no longer expand/collapse — qty controls are always visible on each card
- Remove the `expanded` property and `toggleExpand` callback

**2. New cart item card layout (replaces lines 261-331)**

Each item rendered as a card with `bg-gray-50 rounded-2xl shadow-sm p-3 mb-2`:

```text
┌─────────────────────────────────────────────────┐
│ 1. [icon]  Medicine Name  ᵀᵃᵇˡᵉᵗ    [- 5 +]  │
│            Company Name                         │
│            STK: 50 · MRP: 10    5*10 = 50 ৳    │
│                                        [🗑]     │
└─────────────────────────────────────────────────┘
```

- **Row 1**: Serial number, pill icon, medicine name (bold), product_type superscript, and a pill-shaped qty selector (`rounded-full bg-white border border-emerald-200`) on the far right
- **Row 2**: Company name in subtle gray
- **Row 3**: STK and MRP in `text-[10px] text-gray-400`, then live price calculation (`qty * pcs_per_strip = total ৳`) in emerald-600 on the right, with a small delete button

**3. Emerald green theme accents**
- Price display: `text-emerald-600 font-bold`
- Qty selector border: `border-emerald-200`, buttons `hover:bg-emerald-50`
- Footer "Complete Sale" button: `bg-emerald-600 hover:bg-emerald-700`
- Summary net total: `text-emerald-700`

**4. Keep existing logic unchanged**
- Search bar with X clear icon stays as-is
- `addToCart` still prepends and collapses (collapse no longer needed but harmless)
- All price calculation logic unchanged
- Draft/Complete Sale database logic unchanged

**5. Background**
- Page background: `bg-gray-50` instead of `bg-white`
- Cards: `bg-white rounded-2xl shadow-sm`

### No other files affected.

