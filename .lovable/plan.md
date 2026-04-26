## Goal

Decouple the **display label** ("Chewable Tablet", "Soft Gelatin Capsule", "Oral Suspension") from the **functional category** used by stock/box/strip/MRP logic ("Tablet", "Capsule", "Syrup").

## Approach

Add a new `unit_format` column to `medicines` for the raw display text. Keep the existing `product_type` column, but normalize whatever value arrives there to one of the canonical functional types via a small mapper. The UI shows `unit_format` (falling back to `product_type`); all calculations (`isSingleUnit`, tri-unit, stock alerts) read `product_type` only.

## Database

Migration on `public.medicines`:
- Add `unit_format text` (nullable). Stores the verbatim label like "Chewable Tablet".
- Backfill: `UPDATE medicines SET unit_format = product_type WHERE unit_format IS NULL` so existing rows keep their current display.
- Normalize existing `product_type` values to canonical types using the same mapping rule (Tablet / Capsule / Syrup / else unchanged).

No change to `master_medicines` (it already has both `format` and we map at insert time).

## Code

### `src/lib/productType.ts` (new)
Single source of truth for the mapping:
```ts
export type FunctionalType = "Tablet" | "Capsule" | "Syrup" | string;

export function toFunctionalType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("tablet")) return "Tablet";
  if (s.includes("capsule")) return "Capsule";
  if (s.includes("suspension") || s.includes("syrup")) return "Syrup";
  return raw; // keep original for Cream/Injection/Ointment/etc.
}

export function getDisplayFormat(med: { unit_format?: string | null; product_type?: string | null }) {
  return med.unit_format || med.product_type || "";
}
```

### `src/pages/CatalogSearch.tsx` & `src/pages/Inventory.tsx` (catalog import)
When inserting into `medicines` from `master_medicines`:
- `unit_format: med.format || null` — full display string.
- `product_type: toFunctionalType(med.format)` — normalized.

### `src/pages/AddProduct.tsx`
Manual add already uses canonical types from a fixed dropdown, so set `unit_format = product_type` on save (keeps display consistent with new column). No UX change.

### `src/pages/Inventory.tsx` (list rendering)
- Read functional type from `med.product_type` for `isSingleUnit(...)`, `TriUnitDisplay`, stock alerts (already does this — fix the two spots at lines 249 and 541-553 where it currently reads `med.format` from the catalog match; switch them to use the catalog row's `format` for display only and `toFunctionalType(format)` for logic).
- Display badge shows `getDisplayFormat(med)`.

### `src/pages/CreateSale.tsx`
- Extend the `Medicine` type with `unit_format: string | null`.
- Add `unit_format` to all three `.select(...)` strings (lines 112, 202, 210).
- Search-result row, cart row, and bottom-sheet item: render `getDisplayFormat(med)` in the orange/red superscript badge instead of `med.product_type`.
- All `isSingleUnit(...)` and `totalPiecesToTriUnit(...)` calls continue to receive `product_type` (functional) — unchanged.

### `src/pages/Invoice.tsx` & `src/pages/Sales.tsx`
Sale items already store `medicine_name` only; if a format label is shown anywhere here, swap to display value. (Quick scan shows no `product_type` usage in these files, so likely no edit needed — verify during implementation.)

### Types
`src/integrations/supabase/types.ts` regenerates automatically after the migration.

## Result

- Search result and cart show "Chewable Tablet" / "Soft Gelatin Capsule" / "Oral Suspension".
- Stock display, Box:Strip:Pcs math, low-stock thresholds, and MRP logic all key off the normalized "Tablet" / "Capsule" / "Syrup" values.
- Manually added products are unaffected (their format equals their type).
