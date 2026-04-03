

## Plan: Redesign Cart with Expanded/Collapsed States

### Overview
Re-introduce expand/collapse state for cart items. The most recently added or tapped item shows full controls (expanded). All others show a minimal collapsed row. Auto-collapse on search or new item add.

### Changes in `src/pages/CreateSale.tsx`

**1. Add `expandedId` state**
- New state: `const [expandedId, setExpandedId] = useState<string | null>(null)`
- When `addToCart` is called, set `expandedId` to the new medicine's ID
- When search starts (searchQuery changes to non-empty), set `expandedId` to null
- Clicking a collapsed item sets `expandedId` to that item's ID

**2. Expanded item layout** (matches sketch exactly)

```text
┌──────────────────────────────────────────────────┐
│  ⚕ sergel 20 ᶜᵃᵖˢᵘˡᵉ           healthcarear   │
│  🗑  stk 11.5   MRP 10   10*20=200৳   [- 20 +] │
└──────────────────────────────────────────────────┘
```

- **Row 1**: Pill icon + medicine name (large bold) + product_type superscript + company_name right-aligned
- **Row 2**: Single aligned row — Trash icon, STK value, MRP value, calculation (`qty × price = total ৳`), pill-shaped qty selector on far right. All vertically centered with `items-center`.

**3. Collapsed item layout** (minimal list row)

```text
┌──────────────────────────────────────────────────┐
│  1.  progut 20 ᶜᵃᵖˢᵘˡᵉ    10*10          100 ৳ │
│      popular                                     │
└──────────────────────────────────────────────────┘
```

- **Row 1**: Serial number + medicine name (bold) + product_type superscript + `qty×price` center + total ৳ right
- **Row 2**: Company name in subtle gray
- Clicking the card expands it (sets `expandedId`)

**4. Styling**
- Cards: `bg-white rounded-2xl shadow-sm border border-gray-100`
- Expanded card gets a slightly thicker border: `border-gray-300`
- Emerald green for prices, trash icon bg, qty selector border
- Collapsed cards have `cursor-pointer hover:bg-gray-50`

**5. Keep unchanged**
- Search bar with X clear icon
- `addToCart` prepends to top
- All price/discount/save logic
- Header, footer, summary section

### No other files affected.

