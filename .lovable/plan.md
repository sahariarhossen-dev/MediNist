## Goal

Auto-detect Product Type on the Edit Product screen by scanning the medicine name for keywords ("Tablet", "Capsule", "Syrup/Suspension/Oral") whenever the saved `product_type` is missing.

## Where the fix goes

`src/pages/AddProduct.tsx` — specifically the `useEffect` (line ~80) that hydrates the form from `location.state` when navigating from the Inventory edit action.

Today it does:
```ts
if (s.productType) setProductType(s.productType);
```
…so if the DB row has no `product_type`, the dropdown stays empty even when the name clearly indicates it.

## Changes

### 1. Extend `src/lib/productType.ts`

Reuse the existing `toFunctionalType` mapper, but also make it match the additional keyword "Oral" → "Syrup" (per the new spec). Add a small helper:

```ts
export function detectFunctionalTypeFromName(name: string | null | undefined):
  "Tablet" | "Capsule" | "Syrup" | null {
  if (!name) return null;
  const s = name.toLowerCase();
  if (s.includes("tablet")) return "Tablet";
  if (s.includes("capsule")) return "Capsule";
  if (s.includes("syrup") || s.includes("suspension") || s.includes("oral")) return "Syrup";
  return null;
}
```

(Case-insensitive via `toLowerCase()`. Kept separate from `toFunctionalType` so the existing import logic — which maps the verbatim `format` field — is untouched.)

### 2. Update the hydration `useEffect` in `AddProduct.tsx`

Replace the current block roughly like this:

```ts
const saved = s.productType as ProductType | undefined;
if (saved) {
  setProductType(saved);
} else {
  // Auto-detect from medicine name only when DB value is empty/null
  const detected = detectFunctionalTypeFromName(s.name);
  if (detected) setProductType(detected);
}
```

Rules respected:
- Case-insensitive scan of `medicine_name`.
- Saved DB `product_type` always wins; auto-detect only runs when it's empty/null.
- Runs immediately on mount (the existing effect already runs once), so the dropdown shows the detected value as soon as the page opens.

### 3. No DB changes

Auto-detection is UI-only. The user can still override the dropdown before saving; on save, both `product_type` and `unit_format` are persisted as today.

## Out of scope

- The "Add New Product" flow (no name yet at mount) — auto-detection there would fight the user typing. Not changed.
- Inventory list rendering — display continues to use `unit_format` via `getDisplayFormat`.

## Files touched

- `src/lib/productType.ts` (add `detectFunctionalTypeFromName`)
- `src/pages/AddProduct.tsx` (use it in the edit hydration effect)
