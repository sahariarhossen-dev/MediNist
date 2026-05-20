## Goal

Make the catalog "+" button a **pure, direct copy** of the master medicine JSON row into the shop's `medicines` table. No parsing, no guessing, no form, no quantity prompt.

## Current problem

`src/pages/CatalogSearch.tsx` currently:
- Expands the row and asks for a quantity
- Runs `parsePackSize("10s")` → integer regex
- Runs `computeStripPerPack(...)` → division math
- Calls `toFunctionalType(med.format)` → type-guessing
- Drops the raw `pack_size`, `box_size`, `format`, `generic_name`, `strength` strings on the floor because the `medicines` table has no text columns for them

This violates the "100% direct JSON copy" rule.

## Plan

### 1. Migration — add raw mirror columns to `medicines`

The `master_medicines` table stores `format`, `pack_size`, `box_size`, `strength`, `generic_name` as **text**. The shop `medicines` table has no equivalent text columns, so a true mirror is impossible today. Add them as nullable text:

```sql
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS generic_name text,
  ADD COLUMN IF NOT EXISTS strength    text,
  ADD COLUMN IF NOT EXISTS format      text,
  ADD COLUMN IF NOT EXISTS pack_size   text,
  ADD COLUMN IF NOT EXISTS box_size    text;
```

No RLS changes (existing pharmacy-scoped policy on `medicines` already covers all columns).

### 2. Rewrite `handleAddToInventory` in `src/pages/CatalogSearch.tsx`

Replace the body with a verbatim field-for-field insert:

```ts
await supabase.from("medicines").insert({
  pharmacy_id: profile.pharmacy_id,
  name:          med.brand_name,
  company_name:  med.company,
  generic_name:  med.generic_name,
  strength:      med.strength,
  format:        med.format,
  pack_size:     med.pack_size,
  box_size:      med.box_size,
  price:         med.unit_price,
  // legacy columns kept untouched / null — no parsing, no guessing
});
```

Remove `parsePackSize`, `computeStripPerPack`, `toFunctionalType` from this file. Leave the integer columns (`pcs_per_strip`, `strip_per_pack`, `product_type`, `unit_format`, `stock_quantity`) as `null` — the user can edit them later if they want strip/box math, but the catalog sync no longer derives them.

### 3. Remove the quantity expand UI

Per rule #1 ("the app should NOT open any form or ask for inputs"), the "+" button becomes a one-tap action:
- Delete `expandedId`, `quantity`, the expanded row block, and the qty input
- The card-level Plus button calls `handleAddToInventory(med)` directly with a single confirming toast

Keep the duplicate-check (`name + company_name` already exists) so a double-tap doesn't insert twice — this is not parsing, just idempotency.

### 4. Verify

- Build passes
- Tapping "+" on a catalog row inserts one row in `medicines` with `pack_size = "10's"`, `box_size = "10 x 10's"`, `format = "Tablet"` stored verbatim
- Inventory list still renders (existing columns unchanged, new columns are additive)

## Files

- **New migration** — add 5 text columns to `public.medicines`
- **Edit** `src/pages/CatalogSearch.tsx` — strip parsers, remove qty UI, mirror insert

## Open question

The Inventory / AddProduct / sales / stock UIs currently read `pcs_per_strip` and `strip_per_pack` as integers to do Box:Strip:Pcs math. After this change, catalog-added rows will have `null` there and display as single-unit until the user edits the product. **Confirm that's the intended trade-off** — the alternative is to also display the raw `pack_size` / `box_size` text on the inventory card without parsing it.