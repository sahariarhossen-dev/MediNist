

## Plan: Wholesale Mode with Item-wise Discounts

### Overview
Transform the CreateSale page so that in **Wholesale** mode, each cart item gets its own discount percentage (instead of a single bill-level discount). The UI uses an accordion pattern where only one item is expanded at a time.

### Database Change
Add a `discount_percent` column to `sale_items` to store per-item discounts:

```sql
ALTER TABLE sale_items ADD COLUMN discount_percent numeric NOT NULL DEFAULT 0;
```

No other schema changes needed. The existing `total_price` column will store the net amount after item discount.

### Code Changes

**File: `src/pages/CreateSale.tsx`**

1. **Update `CartItem` interface** — add `discountPercent: number` field (default 0 for retail, default from pharmacy for wholesale).

2. **Add `updateItemDiscount(id, percent)` callback** — updates per-item discount in cart state.

3. **Wholesale expanded card layout** (matching the user's sketch):
   - **Row 1**: Product name + format badge | MRP | Company name (right-aligned)
   - **Row 2**: Trash icon (left) | Stock display | Discount % input (bordered box with % symbol) | Quantity +/- controller
   - **Row 3**: Calculation string: `MRP × Qty = Gross - Disc% = Net ৳`

4. **Wholesale collapsed card layout**:
   - Number prefix | Product name | Company below | Calculation string (e.g. `10*20-10%`) | Bold net amount `৳`

5. **Summary section in wholesale mode**:
   - Hide the global discount editor (since discounts are per-item)
   - Subtotal = sum of all item net amounts (after per-item discounts)
   - Net Total = Subtotal (no additional bill discount)

6. **Retail mode unchanged** — keeps existing global discount behavior.

7. **Recalculation logic**:
   - Retail: `lineTotal = qty * price`, then global discount on subtotal
   - Wholesale: `lineTotal = qty * price * (1 - itemDiscount/100)`, no global discount

8. **Save logic update** — include `discount_percent` per item when inserting into `sale_items`. Set `total_price` to the net amount after item discount.

9. **When toggling retail↔wholesale** — reset item discounts to pharmacy default (wholesale) or 0 (retail).

**File: `src/pages/Invoice.tsx`**
- For wholesale sales, display per-item discount column in the invoice table.

### Technical Details
- Only one item expanded at a time (already implemented via `expandedId`)
- Discount input: `<input type="number" min={0} max={100}` with real-time calculation updates
- All calculations use: `Net = (Qty × MRP) × (1 - Discount/100)`
- The `% icon` button in the sketch becomes a bordered input box with "%" label

