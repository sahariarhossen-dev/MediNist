

## Plan: Activate Complete Sale with Stock Deduction & Live Sales History

### Overview
The `saveSale` function in CreateSale.tsx already inserts into `sales` and `sale_items`. We need to add stock deduction and post-sale cleanup. The Sales.tsx page currently uses hardcoded data — we'll replace it with live Supabase queries.

### Changes

**1. `src/pages/CreateSale.tsx` — Add stock deduction + post-sale reset (lines 86-134)**

After inserting sale_items, loop through cart items and update each medicine's `stock_quantity` by decrementing the sold quantity:

```typescript
// After sale_items insert succeeds
for (const c of cartItems) {
  const newStock = (c.medicine.stock_quantity || 0) - c.quantity;
  await supabase
    .from("medicines")
    .update({ stock_quantity: Math.max(0, newStock) })
    .eq("id", c.medicine.id);
}
```

On success: clear cart (`setCartItems([])`), reset search, show toast, then navigate to `/sales`.

**2. `src/pages/Sales.tsx` — Fetch real sales data from Supabase**

- Import `supabase`, `useAuth`, `useState`, `useEffect`
- Fetch today's completed sales filtered by `pharmacy_id` and `created_at >= today`
- Calculate today's total dynamically
- Display real sales history (id truncated, time formatted, total amount)
- Remove all hardcoded `salesHistory` data

### No database changes needed
The existing `medicines` table has an ALL RLS policy, so UPDATE is permitted. Stock deduction works with the current schema.

### Files affected
- `src/pages/CreateSale.tsx` — stock deduction + cart reset
- `src/pages/Sales.tsx` — live data from Supabase

