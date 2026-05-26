## Problem

The app currently decides "single unit vs strip-based" from `pcs_per_strip` and `strip_per_pack` alone (`getPackMode`/`isSingleUnit` in `src/lib/stockUtils.ts`).

For products like **Allion Gold** (one pot of 30 tablets, typically stored as `pcs_per_strip=30, strip_per_pack=1`) or **A-Phenicol** (10ml eye-drop, often stored as `pcs_per_strip=10`), this returns `"strip"` mode, so the UI renders the tri-unit "B : S : P" matrix (e.g. `STK 5 : 0 : 0`). These should be sold as a single bottle/pot at the flat unit price.

`Atoz Premium` (real tablet strips with both `pcs_per_strip>1` AND `strip_per_pack>1`) must keep the tri-unit breakdown — that part already works.

## Fix Strategy

Introduce an explicit packaging signal on each medicine and route every "is this a single product?" check through it, so the inventory parser, sales search list, and cart row all render the right layout.

### 1. Database: add explicit `packaging_type`

Add column `packaging_type text` on `public.medicines` with values `'single' | 'strip_based'` (nullable for legacy rows). Backfill in the same migration:

- `strip_based` when `pcs_per_strip > 1 AND strip_per_pack > 1` (real tablet/capsule strip-in-box products like Atoz Premium).
- `single` for everything else — pots, drops, syrups, inhalers, creams, ointments, single-pack tablets (Allion Gold), and anything currently rendering as `"strip"` mode but whose product_type isn't a true strip product. Concretely: standardized category in {Syrup, Injection, Inhaler, Topical} OR (Tablet/Capsule with `strip_per_pack ≤ 1`).

Future inserts: `AddProduct` and `Inventory` "add from catalog" set `packaging_type` explicitly based on the same rule, so no row goes to the database without a value.

### 2. `src/lib/stockUtils.ts`

- Extend `PackInfo` with `packaging_type?: 'single' | 'strip_based' | null`.
- `getPackMode` and `isSingleUnit` honor `packaging_type` first:
  - `packaging_type === 'single'` → always `"single"` regardless of pack numbers.
  - `packaging_type === 'strip_based'` → use existing pack-numbers logic.
  - `null/undefined` → current heuristic (back-compat for any row the migration missed).
- Keep `totalPiecesToTriUnit*` unchanged; they only get called when `isSingleUnit` is false.

### 3. Sales search list & cart (`src/pages/CreateSale.tsx`)

- Include `packaging_type` in both medicine SELECTs (lines ~114, 205, 213) so the field flows into search results and the cart row.
- Existing autocomplete renderer (line 543) and cart-row STK (line 658) already branch on `isSingleUnit(med)` — they automatically produce the clean `STK: 5 Pcs` / `stk 5` layout once `isSingleUnit` returns true.
- `addToCart` already adds 1 unit at the flat `med.price` and the quantity stepper is a flat integer — no strip/piece selector exists today, so no extra change needed for single products. (Wholesale discount % stays available for both modes.)

### 4. Inventory page (`src/pages/Inventory.tsx`)

- Include `packaging_type` in the medicines SELECT and in the type definition.
- `TriUnitDisplay` (line 72) already short-circuits when `isSingleUnit` is true → it will render the plain integer once the field is present.
- The "Box / Strip / Pcs" expanded editor (line 604 onward) keeps the `isSingleUnit` branch that already labels the input "Qty" for single products. For pot-style single products it will now correctly show one number instead of `B.S.P`.
- Catalog "Add" flow (line ~680): keep `catalogIsMulti` but derive it from the same rule (Tablet/Capsule with both strip & pack > 1); persist `packaging_type` accordingly when inserting the new medicine row.

### 5. Short items page (`src/pages/ShortItems.tsx`)

Add `packaging_type` to the SELECT and to the local `LowStockItem` type — the row already calls `isSingleUnit(item)` so display will switch automatically.

### 6. Add / Edit Product UI (`src/pages/AddProduct.tsx`)

Add a small two-option toggle: **Single unit (pot / bottle / drop / syrup / inhaler)** vs **Strip-based (tablet strips in a box)**. Default driven by product_type (Tablet/Capsule with strip_per_pack > 1 → strip_based, else single). When "Single" is chosen, hide the `pcs_per_strip` and `strip_per_pack` inputs and persist `packaging_type='single'` with both pack numbers null/1. When "Strip-based", show the existing strip/box inputs and save `packaging_type='strip_based'`.

## Acceptance Checks

- Allion Gold (pot of 30) shows `STK: 5 Pcs` everywhere; adding to cart yields 1 unit × ৳unit_price.
- A-Phenicol (10ml drop) shows `STK: 3 Pcs`; cart line is flat.
- Atoz Premium continues to show `B • S • P` in inventory and `STK: 2 : 1 : 4` in sales, with the existing tri-unit add/edit controls.
- New products created via AddProduct or Catalog "Add" save with the correct `packaging_type`.

## Technical Notes

- All changes are additive and back-compat: any row where `packaging_type` is still null falls back to the current heuristic.
- The migration is data + schema only; no RLS changes needed (column inherits the existing pharmacy-scoped policy on `medicines`).
- No changes to `sale_items` schema — line items remain `quantity × unit_price` and that already works for single products.