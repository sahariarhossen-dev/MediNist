## Fix Catalog Dedup to Use Name + Company + Strength

### The bug
In `src/pages/Inventory.tsx`, `filteredCatalog` (lines 266–275) builds an exclusion key from only `name + company_name`. So adding "Antigall 300 mg" hides every Antigall strength from the catalog.

### Fix
Include strength in the composite key on both sides:

- Local key: `${name}|${company_name}|${product_size}` (lowercased, trimmed; treat null/empty strength as `""`)
- Catalog key: `${brand_name}|${company}|${strength}` (same normalization)

Now only the exact strength variant added to the shop is excluded; other strengths of the same brand stay in "From Catalog".

### Also align the duplicate guard in `handleAddFromCatalog`
That handler currently inserts without checking duplicates, but `CatalogSearch.tsx` does a duplicate check on `name + company_name` only. Update both to also match `product_size = master.strength` so the same composite key is used everywhere.

Files:
- `src/pages/Inventory.tsx` — update `filteredCatalog` key + (optional) add the same composite check before insert in `handleAddFromCatalog`.
- `src/pages/CatalogSearch.tsx` — update the existing duplicate `.maybeSingle()` query to also `.eq("product_size", med.strength ?? "")` (or skip the eq when strength is null and match `is null`).

### Result
"Antigall 300 mg" added → only that card moves to inventory; "Antigall 150 mg" stays in catalog.
