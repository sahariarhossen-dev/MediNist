## Goal

Convert the Inventory screen so that the **Shop Inventory** (top) and **Master Catalog** (bottom) sections render together whenever the user filters by company, with a unified search bar that drives both sections and a fast-add flow that promotes a catalog item into the shop list in real time.

## Current behavior (for reference)

- Catalog rows only appear when there is a search query.
- Catalog is excluded by `name + company` key — works, but tied to search.
- Company filter affects only the inventory list when no search is active.

## Changes to `src/pages/Inventory.tsx`

### 1. Trigger dual-section view from filter OR search

A new derived flag drives the split layout:

```
const isDualMode = selectedCompanies.size > 0 || !!searchQuery.trim();
```

When `isDualMode` is true, render both:
- **Shop Inventory** section (filtered local medicines for selected companies + search)
- **Master Catalog** section (master items for selected companies, minus any already in shop inventory, plus search)

When `isDualMode` is false, keep today's "In Your Inventory" only view.

### 2. Rework `filteredCatalog`

Today catalog is empty unless `searchQuery` exists. New rule:

- If `selectedCompanies.size === 0` AND no search → return `[]` (no catalog spam on the default screen).
- Otherwise:
  - Start from `catalog`.
  - If companies selected → keep only items whose `company` ∈ `selectedCompanies`.
  - Build an exclusion set of `name|company` from the **full** `medicines` list scoped to the same company filter (not just the visible filtered ones) so a med in inventory never leaks into catalog even if search hides it from the top.
  - If `searchQuery` present → match against brand/generic/company.
  - Sort A–Z by `brand_name` (already the fetch order, re-sort defensively after filter).

### 3. Section headers + counts

Show section labels whenever `isDualMode`:
- "In Your Inventory (n)" — even when n = 0, render an empty-state hint inside the section ("No items from this company in your shop yet").
- "From Catalog (n)" — same idea; empty-state hint when n = 0.

Keep current card markup, badges, icons, stock display, expand-to-add UX — only the gating logic changes.

### 4. Fast-add real-time transition

`handleAddFromCatalog` already inserts and prepends to `medicines` state. Confirm:
- After insert the new row appears in Shop Inventory section instantly (already does via `setMedicines`).
- The exclusion set re-derives from `medicines`, so the same row drops out of the catalog list on the next render — no reload needed. ✅ already works once §2 is in place.

### 5. Efficiency note

We already fetch master catalog once on mount (single query, sorted). No per-keystroke Supabase calls — filtering is all in-memory, which is the cheapest equivalent of `.not('name','in',…)` for this dataset and keeps the search snappy across both sections. No fetch logic changes needed.

### 6. Cleanup

- Remove the "search-only" guard around the catalog block.
- Keep manual-add link visible at the bottom of catalog whenever the catalog section is shown.
- Keep all existing styles, long-press edit/delete, filter sheet, tri-unit display — untouched.

## Files

- `src/pages/Inventory.tsx` — only this file changes.

No DB, RLS, or types changes.
