## Goal
Three connected bugs introduced by the recent spider sync:
1. `pack_size` like "5 x 10" is being interpreted with strips/pcs reversed in the UI.
2. Existing rows in `medicines` already contain swapped values and need to be corrected.
3. The Taka symbol `৳` renders as `;` in some price cells because the active font (a `font-mono` / `tabular-nums` stack) does not contain the Bengali Taka glyph (U+09F3) and the browser falls back to a glyph that looks like a semicolon.

---

## 1. Parser: prefer NxM, fall back to division

File: `src/lib/stockUtils.ts` — `classifyCatalogPack`.

Current behavior treats `pack_size` as pcs-per-strip and divides `box_size` by it, so MedEx "5 x 10" (5 strips × 10 pcs, box of 50/100) ends up stored as `pcs_per_strip=5, strip_per_pack=20`.

New rule, in order:
- If `pack_size` matches `^\s*(\d+)\s*[xX×]\s*(\d+)` → `strip_per_pack = first`, `pcs_per_strip = second`. Stop.
- Else fall through to the existing `box_size ÷ pack_size` logic for single-number formats like `"10s pack"`.
- Sanity guard: if both numbers are produced and `box_size` parses to a positive integer that doesn't equal `strips × pcs`, log a warning but trust NxM.

Add a tiny pure helper `parseNxMPack(pack_size: string | null)` returning `{ strip_per_pack, pcs_per_strip } | null` so it can be reused by the edge function and a unit test.

Add a vitest in `src/test/` covering:
- `"5 x 10"` → `{5, 10}`
- `"20 x 10"` → `{20, 10}`
- `"10's pack"` → falls through
- `"10 X 14"` → `{10, 14}` (Maxpro case)

## 2. Edge function: spider-catalog-sync

File: `supabase/functions/spider-catalog-sync/index.ts` — `parseBrandPage`.

Logic is already `strip_per_pack = nxm[1]; pcs_per_strip = nxm[2]`, which is correct. Keep as-is but:
- Add a hardening comment referencing the rule.
- When mirroring to `medicines`, also write `pack_size` text so the frontend's new NxM parser has the source string to recompute from on the fly.

## 3. One-shot SQL backfill

Migration to recompute legacy rows whose `pack_size` matches NxM:

```sql
WITH parsed AS (
  SELECT id,
         (regexp_match(pack_size, '(\d+)\s*[xX×]\s*(\d+)'))[1]::int AS spp,
         (regexp_match(pack_size, '(\d+)\s*[xX×]\s*(\d+)'))[2]::int AS pps
  FROM public.master_medicines
  WHERE pack_size ~ '\d+\s*[xX×]\s*\d+'
)
UPDATE public.master_medicines m
SET strip_per_pack = p.spp,
    pcs_per_strip  = p.pps
FROM parsed p
WHERE m.id = p.id
  AND (m.strip_per_pack IS DISTINCT FROM p.spp
    OR m.pcs_per_strip  IS DISTINCT FROM p.pps);
```

Then mirror the corrected values into `public.medicines` by joining on `(lower(name), lower(company_name))`, matching the pattern already used by `admin_resync_medicines_pack_info`.

This is data-only, but because we're invoking schema/migration tooling for it, it goes through the migration tool.

## 4. On-save guard (defense in depth)

In `src/pages/AddProduct.tsx` (the place that writes to `medicines`), before insert/update:
- If the user has typed a `pack_size` that matches NxM, recompute `strip_per_pack` and `pcs_per_strip` from it and overwrite whatever is currently in those fields. This guarantees future edits self-heal any remaining bad rows.

## 5. Taka symbol fallback

Root cause: `font-mono` (ui-monospace, SFMono-Regular, Menlo, Monaco, …) and some `tabular-nums` mono fallbacks do not contain U+09F3. Browsers then pick a glyph from the next family in the cascade, occasionally rendering a `;`-looking shape.

Fix:
- Add a `font-taka` utility in `tailwind.config.ts` that prepends a font stack guaranteed to have `৳`: `'Noto Sans Bengali', 'Hind Siliguri', system-ui, sans-serif`.
- In `src/index.css`, add a `@layer base` rule so any element using `.font-mono`, `.tabular-nums`, or a `.price` class still resolves U+09F3 via a CSS `unicode-range` `@font-face` override, or simpler: wrap every `৳` in a `<span className="font-taka">৳</span>` via a single tiny component `<Taka />` and replace the bare `৳` literals in price-rendering files.
- Concrete approach (least intrusive): create `src/components/Taka.tsx` exporting `<Taka />` and a `formatTaka(n)` helper that returns JSX. Replace `৳{...}` usages in the files that combine the symbol with `font-mono` / `tabular-nums`:
  - `src/pages/Invoice.tsx` (6 spots, all `font-mono`)
  - `src/pages/Inventory.tsx` (2 spots, `tabular-nums`)
  - `src/pages/DailyTransactions.tsx`, `src/pages/AllTransactions.tsx`, `src/pages/Sales.tsx`, `src/pages/PersonalReport.tsx`, `src/pages/Index.tsx`, `src/pages/CreateSale.tsx`, `src/pages/Customers.tsx`, `src/pages/CustomerProfile.tsx`, `src/pages/Profile.tsx`, `src/pages/ShopProfile.tsx`, `src/pages/ShortItems.tsx`, `src/pages/SubscriptionCheckout.tsx`, `src/hooks/useNotifications.ts`
- Also link the Bengali font in `index.html`:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" rel="stylesheet">
  ```

## 6. Verification

- Run the new vitest for `parseNxMPack`.
- Open Inventory and confirm Amloten now shows `5 strips × 10 pcs` (B:S:P breakdown matches MedEx).
- Open a chat medicine card and the invoice screen and confirm `৳` renders correctly in both `font-mono` and `tabular-nums` contexts.
- Confirm no regression in the existing `looksSingleUnit` / single-unit Syrup/Drops handling — single-number `pack_size` strings still fall through to the unchanged branch.

## Files

- Edit: `src/lib/stockUtils.ts`, `src/pages/AddProduct.tsx`, `tailwind.config.ts`, `src/index.css`, `index.html`, plus the price-rendering files listed above
- Edit: `supabase/functions/spider-catalog-sync/index.ts` (comment + mirror `pack_size`)
- Create: `src/components/Taka.tsx`, `src/test/parseNxMPack.test.ts`
- Migration: one-shot backfill of `master_medicines` and `medicines`

## Out of scope

- Re-running the spider crawl over all brands.
- Changing the storage format of `pack_size` (kept as the raw MedEx string).
- Touching the tri-unit display math itself — once `strip_per_pack` / `pcs_per_strip` are right, the existing `totalPiecesToTriUnit*` helpers already render correctly.
