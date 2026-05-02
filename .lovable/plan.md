# Fix: Product badges show "Other" for valid types like Suppository / Pediatric

## Root cause

`src/lib/productType.ts` defines a fixed 7-category union (`Tablet`, `Capsule`, `Syrup`, `Injection`, `Inhaler`, `Topical`, `Other`). `getStandardizedType()` keyword-scans the string and returns `"Other"` for anything that doesn't match — so `"Suppository"`, `"Pediatric"`, `"Eye Drop"`, etc. all render as **Other** on the badge, even though the database row stores the correct value.

The badge component itself is fine; the bug is the helper collapsing unknown-but-valid types.

## The fix

### 1. New helper: `getDisplayCategory(raw)` in `src/lib/productType.ts`

Returns a short, human-readable label for the badge, **never** "Other" when a real value exists:

- If the raw string matches one of the 7 standard patterns → return that standard name (`Tablet`, `Capsule`, …). Keeps the existing dedupe behavior so "Soft Gelatin Capsule" still shows as **Capsule**.
- Otherwise → return a Title-Cased version of the raw string itself (e.g. `"suppository"` → `Suppository`, `"PEDIATRIC"` → `Pediatric`, `"Eye Drop"` → `Eye Drop`). Truncate to ~14 chars with ellipsis so long custom labels don't break the 390 px row layout.
- Empty / null → return `""` (caller already guards on truthiness, so no badge renders).

Add a few more keyword patterns that are common in Bangladeshi pharmacies so they get a consistent color chip: `Suppository`, `Drops` (eye/ear/nasal), `Powder`, `Sachet`. These get their own `StandardCategory` entries with chip colors in `getProductTypeChipClasses`. "Pediatric" is a **form modifier**, not a dosage form — leave it as a custom label rendered verbatim.

### 2. Update chip color helper

Extend `getProductTypeChipClasses` so the new categories above get distinct colors, and unknown custom strings get a neutral slate chip (instead of the current gray "Other" chip) so they look intentional, not broken.

### 3. Swap badge call sites from `getStandardizedType` → `getDisplayCategory`

Three files render the badge:

- `src/pages/Inventory.tsx` (line ~488)
- `src/pages/CreateSale.tsx` (lines ~536, ~639, ~737)
- `src/pages/ShortItems.tsx` (line ~153)

Each becomes:
```tsx
<span title={med.product_type || med.unit_format}
      className={getProductTypeChipClasses(med.product_type || med.unit_format)}>
  {getDisplayCategory(med.product_type || med.unit_format)}
</span>
```

Keep `getStandardizedType` for **logic** (tri-unit detection, stock alerts, strip/box rules) — that's where the 7-bucket collapse is correct. Only the **display** path changes.

### 4. Make matching case-insensitive everywhere

Existing patterns already use `/i`, but verify `fetchPharmacyProductTypes` dedupe uses `.toLowerCase()` keys (it does). No change needed beyond confirming.

### 5. Stale-data refresh

The Inventory list already refetches via its load effect after edit. No state-cache bug — the "Other" was always rendered fresh from the DB; the helper was the culprit. After the helper change, edits will reflect immediately on the next list mount/refetch with no further work.

## Files touched

- `src/lib/productType.ts` — add `getDisplayCategory`, extend patterns + chip colors
- `src/pages/Inventory.tsx` — swap badge text
- `src/pages/CreateSale.tsx` — swap badge text (3 spots)
- `src/pages/ShortItems.tsx` — swap badge text

No DB changes, no migrations, no schema edits. Pure frontend helper refactor.

## Mobile QA (390 px)

Custom labels are truncated to 14 chars + ellipsis in the helper, so even long strings like "Dry Powder Inhalation Capsule" (which still maps to **Capsule** anyway) or a custom "Reconstitution Powder" → `Reconstitut…` won't push action buttons off-screen. Full string remains in the `title` tooltip.
