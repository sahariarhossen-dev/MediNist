# Fix Strip/Pack Logic for Liquid/Single-Unit Products

## Problem
On the Add/Edit Product page (`src/pages/AddProduct.tsx`), the "Strip & Pack Details" section (Pcs per Strip × Strips per Box) is shown for every product type. This lets a Syrup or Suspension end up with values like 12 × 15 = 180 pcs, corrupting inventory.

## Solution
Make the strip/pack inputs strictly conditional on the standardized product type being **Tablet** or **Capsule**. Everything else (Syrup, Suspension, Injection, Cream, Ointment, Drop, Inhaler, etc.) is treated as a single unit (1 × 1 = 1 pc).

## Changes in `src/pages/AddProduct.tsx`

1. **Derive a flag** from the existing `standardizedType`:
   ```ts
   const usesStripPack = standardizedType === "Tablet" || standardizedType === "Capsule";
   ```

2. **Auto-clear values when the type switches to single-unit.** Add an effect:
   ```ts
   useEffect(() => {
     if (!usesStripPack) {
       setPcsPerStrip("");
       setStripPerBox("");
     }
   }, [usesStripPack]);
   ```

3. **Conditionally render the "Strip & Pack Details" block** — only when `usesStripPack` is true. For non-Tablet/Capsule types, hide the entire section (cleanest UI; matches the user's "HIDE … completely" preference).

4. **Save payload** (`handleSave`): when `!usesStripPack`, force `pcs_per_strip` and `strip_per_pack` to `1` regardless of any stale state, so the DB always reflects "1 unit = 1 pc" for single-unit products.

5. The existing edit-prefill effect already populates these values from `location.state`. The new auto-clear effect runs after prefill (because `productType` is set in the same effect) and will correctly wipe them if the loaded product is single-unit — desired behavior to repair legacy bad data on next save.

## Out of scope
- `src/lib/stockUtils.ts`, inventory display logic, catalog importer — untouched. Only the Add/Edit Product form is changing.
- No DB migration; existing rows are corrected when re-saved through the form.
