# Intelligent Product Auto-Categorization

Upgrade the existing `src/lib/productType.ts` helpers into a single keyword-priority engine that maps any raw `product_type` / `unit_format` string (e.g. "Dry Powder Inhalation Capsule", "Soft Gelatin Capsule", "Oral Suspension") to one of seven Standard Categories, then thread that engine through the Add Product form, POS/Sales, Inventory, Catalog Search, and Short Items screens.

The full technical string remains stored in Supabase (`medicines.unit_format`); the Standard Category drives all UI logic and grouping.

## 1. Standardization engine (`src/lib/productType.ts`)

Add a single source of truth:

- `StandardCategory` union: `"Tablet" | "Capsule" | "Syrup" | "Injection" | "Inhaler" | "Topical" | "Other"`.
- `getStandardizedType(raw: string | null | undefined): StandardCategory` — keyword scan with **priority order** (first match wins, so "Inhalation Capsule" → Capsule, not Inhaler):
  1. **Capsule** — `capsule`, `softgel`, `soft gelatin`, `\bcap\b`
  2. **Tablet** — `tablet`, `\btab\b`, `bolus`
  3. **Syrup** — `suspension`, `syrup`, `oral liquid`, `solution`
  4. **Injection** — `injection`, `\biv\b`, `\bim\b`, `vial`, `ampoule`
  5. **Inhaler** — `inhaler`, `\bmdi\b`, `\bdpi\b`, `aerosol`, `respule`, `nebul`
  6. **Topical** — `cream`, `ointment`, `gel`, `lotion`
  7. **Other** — fallback
- Refactor `toFunctionalType`, `getFunctionalBucket`, `detectFunctionalTypeFromName`, `getProductTypeChipClasses`, and `stockUtils.isSingleUnit` / `getEffectiveStockAlert` to delegate to `getStandardizedType` so the keyword rules live in one place.
- `isTriUnitCategory(cat)` → `true` only for `Tablet` and `Capsule` (drives strip/box UI + auto-calc).
- Keep the verbatim string available via `getDisplayFormat(med)` (already exists) for tooltips/long-form display.

## 2. Add Product form (`src/pages/AddProduct.tsx`)

- Replace the `isTabletOrCapsule` boolean with `isTriUnitCategory(getStandardizedType(productType))` so any technical string mapping to Tablet/Capsule (e.g. "Inhalation Capsule", "Chewable Tablet") shows the **Strip & Pack Details** section and enables the `Pcs × Strip × Box` auto-calc preview.
- `getStrengthConfig` and `getTypeIcon` switch on the standardized category instead of substring checks; Inhaler gets its own icon/strength label (`puffs`).
- Mobile responsiveness: keep current `grid-cols-2 gap-3` for strip/pack inputs; ensure the new auto-calc preview line uses `text-xs` + `break-words` so long labels never overflow at 390 px.

## 3. POS / Sales screen (`src/pages/CreateSale.tsx`)

- Replace the raw `getDisplayFormat(med)` superscript tag with the **Standard Category** chip (`getStandardizedType(...)`) using `getProductTypeChipClasses` for color. The full technical string moves to the element's `title` attribute so it's still discoverable on hover/long-press but never breaks the row layout on a 390 px viewport.
- `isSingleUnit` calls switch from raw `product_type` to `getStandardizedType(med.unit_format ?? med.product_type)` so a product saved as "Dry Powder Inhalation Capsule" still displays Box:Strip:Pcs stock.

## 4. Inventory + Short Items + Catalog Search

- `src/pages/Inventory.tsx`: chip rendering already uses `getProductTypeChipClasses`; pass it the standardized category. `isSingleUnit(...)` calls and the catalog-import branch (`toFunctionalType(med.format)`) route through `getStandardizedType` so newly imported products store the technical string in `unit_format` and the standardized category in `product_type`.
- `src/pages/ShortItems.tsx` + `src/pages/CatalogSearch.tsx`: same swap — display the standard category tag, keep the full string as title.

## 5. Multi-tenant inventory mapping

- `fetchPharmacyProductTypes(pharmacyId)` already merges seed categories with each pharmacy's distinct `product_type`. Update it to:
  1. Map every fetched `product_type` through `getStandardizedType` and **dedupe by standardized category** so a shop that already has "Capsule" doesn't end up with both "Capsule" and "Inhalation Capsule" entries in their dropdown.
  2. Always present the seven standard categories first, then any genuinely-new custom types (e.g. "Eye Drop") sorted alphabetically.
- On save in `AddProduct`, write the standardized category to `medicines.product_type` and the verbatim user/catalog string to `medicines.unit_format`. This means a brand-new shop adding their first "Soft Gelatin Capsule" automatically links to the existing "Capsule" group; if they add "Eye Drop", a new shop-specific entry appears.

## Technical details

- No DB schema changes — `medicines.product_type` (standardized) and `medicines.unit_format` (verbatim) already exist.
- No migration/backfill of existing rows; the standardization engine is tolerant of legacy values because it keyword-scans on read.
- All changes are pure-frontend + helper refactors; no edge functions or RLS changes.
- Files touched: `src/lib/productType.ts`, `src/lib/stockUtils.ts`, `src/pages/AddProduct.tsx`, `src/pages/CreateSale.tsx`, `src/pages/Inventory.tsx`, `src/pages/CatalogSearch.tsx`, `src/pages/ShortItems.tsx`.
- Mobile QA target: 390 × 641 (current preview viewport). Standard-category chips are short (≤9 chars) so labels never wrap or push action buttons off-screen.
