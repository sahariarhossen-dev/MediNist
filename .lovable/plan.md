# Inventory Page Redesign — Match Sales Page Typography

Restyle the inventory list so each product card looks like the polished Sales-screen rows: white background, bold dark medicine name, lighter company text, colored product-type chip, and a friendlier `0 Bx • 1 St • 5 Pc` stock format.

## What Changes (User-Facing)

1. **Cards** — switch from flat gray (`bg-muted`) to white with subtle shadow + light border, matching Sales (`bg-white shadow-lg shadow-gray-200/60 border border-gray-100`). Increase vertical breathing room between rows.
2. **Typography hierarchy** (same scale as Sales):
   - Medicine name: `text-sm font-bold text-gray-900`
   - Company name: `text-[11px] text-gray-400` (smaller, lighter)
   - Strength (e.g. 500mg): `text-[10px] text-gray-400`
3. **Product type chip** — small colored pill shown next to/under the medicine name:
   - Tablet → blue (`bg-blue-50 text-blue-700`)
   - Capsule → purple (`bg-purple-50 text-purple-700`)
   - Syrup / Suspension → amber (`bg-amber-50 text-amber-700`)
   - Injection → rose (`bg-rose-50 text-rose-700`)
   - Cream / Ointment → teal (`bg-teal-50 text-teal-700`)
   - Drops (Eye/Ear/Nasal/Pediatric) → cyan (`bg-cyan-50 text-cyan-700`)
   - Inhaler / MDI / DPI → indigo (`bg-indigo-50 text-indigo-700`)
   - Anything else → neutral gray (`bg-gray-100 text-gray-600`)
4. **Stock format** — replace `0 : 1 : 5` with `0 Bx • 1 St • 5 Pc`. Single-unit products (drops, syrups, etc.) keep `12 Pcs`. Numbers stay tabular and bold; unit suffixes in lighter gray.
5. **Catalog "From Catalog" cards** in the search results get the same white-card + chip treatment so the two sections feel cohesive.

## Visual Reference

```text
┌────────────────────────────────────────────────┐
│  💊  Napa Extra            500mg               │
│      Beximco Pharma                 0 Bx • 1 St • 5 Pc │
│      [Tablet]                                  │
└────────────────────────────────────────────────┘
```

## Technical Notes

- **`src/lib/stockUtils.ts`** — add `totalPiecesToTriUnitLabeled(totalPcs, spp, pps)` returning `"0 Bx • 1 St • 5 Pc"`. Keep existing `totalPiecesToTriUnit` for places that still need the colon format.
- **`src/lib/productType.ts`** — add `getProductTypeChipClasses(type: string | null): string` that maps a product_type (case-insensitive, keyword-based via existing `getFunctionalBucket` plus extra checks for "drop"/"inhaler"/"injection"/"cream"/"ointment") to Tailwind class strings. Centralised so other screens can reuse later.
- **`src/pages/Inventory.tsx`**:
  - Replace the in-file `TriUnitDisplay` to use the new labeled formatter (Bx/St/Pc), keeping muted styling for unit suffixes and bold tabular nums for digits.
  - Update the medicine card container classes from `bg-muted rounded-2xl` to `bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-200/50`.
  - Increase list spacing from `space-y-3` to `space-y-3.5` and bump card padding to `p-4` (already there) but adjust internal text sizes to match Sales.
  - Replace the medicine name `<p>` block with a two-line layout: name + strength on top (`font-bold text-gray-900 text-sm`), then a flex row containing the company (`text-[11px] text-gray-400`) and the product-type chip from `getProductTypeChipClasses`.
  - Apply the same chip + typography treatment to the "From Catalog" rows (using `med.format` mapped via `toFunctionalType`).
  - Long-press / expand interaction, stock editing, delete flow, filters — unchanged behaviour, only restyled where text colors are touched.

No database changes. No routing or behavioural changes — purely visual + a couple of helper utilities.
