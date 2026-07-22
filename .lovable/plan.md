## Plan: MedEx Scraper Data Mapper for Inventory Form Integration

### Goal
Build a single, reusable mapping layer that converts raw MedEx product data (HTML or JSON) into a clean payload that can either auto-fill the Add Product form or be inserted into `master_medicines` / `medicines`.

### What we will build

1. **Define the shared mapping contract** (`MedExMappedPayload`)
   A typed payload that aligns with both the Add Product form and the database columns:
   - `name` — MedEx brand name
   - `genericName` — MedEx generic name
   - `companyName` — MedEx manufacturer
   - `productType` — standard category (Tablet, Capsule, Syrup, Injection, Inhaler, Topical, Other) via `getStandardizedType`
   - `unitFormat` — verbatim MedEx form label, e.g. "Chewable Tablet" or "Pediatric Drops"
   - `strength` — raw MedEx strength text
   - `strengthNumeric` / `strengthUnit` — first numeric value + unit for the strength/volume/weight/doses input
   - `pcsPerStrip` / `stripPerBox` / `pcsPerBox` — pack math derived from `classifyCatalogPack` / `parseNxMPack`
   - `packSizeText` — the original MedEx pack string
   - `unitPrice` — per-piece unit price
   - `boxPrice` — `unitPrice × pcsPerBox`, rounded with `roundMoney`
   - `medexUrl` / `medexStatus` / `confidence` — provenance fields

2. **Create client utility `src/lib/medExMapper.ts`**
   - `parseMedExProductData(rawData: string | MedExRawData): MedExMappedPayload`
     - If `rawData` is an HTML string, parse it with a lightweight, regex-based field extractor (same patterns as the edge function) to pull brand, generic, strength, company, pack, and prices.
     - If `rawData` is already a parsed JSON object, map directly.
   - Reuse existing helpers: `getStandardizedType`, `getFunctionalBucket`, `parseNxMPack`, `classifyCatalogPack`, `roundMoney`.
   - For non-strip products (Syrup, Injection, Cream, Drops, Inhaler, etc.), gracefully default `pcsPerStrip = 1`, `stripPerBox = 1`, `pcsPerBox = 1`.
   - `toAddProductState(payload): object` — converts the mapped payload into the `location.state` keys the `AddProduct` form already consumes (`name`, `companyName`, `productType`, `strength`, `mrp`, `pcsPerStrip`, `stripPerBox`).

3. **Create server-side mirror in the edge function**
   - Add `supabase/functions/spider-catalog-sync/medexMapper.ts` containing the same `MedExMappedPayload` type, `detectFormat`, `parseBrandPage`, and a new `mapBrandPageToPayload(page, masterRow?)` function.
   - This keeps the Deno parser isolated from the browser bundle while using identical logic.

4. **Refactor `supabase/functions/spider-catalog-sync/index.ts`**
   - Move `parseBrandPage`, `detectFormat`, and related helpers into the new `medexMapper.ts` module.
   - Replace the two inline `after` object constructions (strip vs. non-strip) with a single call to `mapBrandPageToPayload(page)` and a `toMasterUpdate(payload)` helper.
   - Ensure the matched-row write path still produces the same fields (`unit_price`, `pcs_per_strip`, `strip_per_pack`, `pack_size`, `format`, `strength`, `generic_name`, `company`, `medex_*`), but derived from the mapper instead of ad-hoc logic.
   - Keep the existing math verification and retry-status behavior untouched.

5. **Wire AddProduct to accept the mapper payload**
   - In `src/pages/AddProduct.tsx`, extend the `location.state` consumption to also accept a `medexPayload` key; if present, call `toAddProductState` and populate the form fields.
   - No new UI is added; this simply lets the backend pass a pre-filled MedEx payload into the same form flow.

6. **Add unit tests `src/test/medExMapper.test.ts`**
   Cover the key mapping cases:
   - `"3 x 10"` → `pcsPerStrip: 10`, `stripPerBox: 3`, `pcsPerBox: 30`
   - `"10 x 10"` → `pcsPerStrip: 10`, `stripPerBox: 10`, `pcsPerBox: 100`
   - `"100 ml bottle"` (Syrup) → `pcsPerBox: 1`, `unitPrice` preserved, `boxPrice == unitPrice`
   - `"1 vial"` (Injection) → `pcsPerBox: 1`, `productType: "Injection"`
   - Strength `"40 mg+500 mg+250 mg+100 mg"` → `strength` preserved, `strengthNumeric` / `strengthUnit` derived from the first component
   - Price math: `unitPrice = 45.00`, `pcsPerBox = 30` → `boxPrice = 1350.00`

7. **Verify**
   - Run `bunx vitest run src/test/medExMapper.test.ts` (and the full suite) to confirm no regressions.
   - Deploy the refactored `spider-catalog-sync` edge function and run a dry scan against a few rows to confirm the matched samples return the same `after` shape as before.

### Outcome
A single source of truth for MedEx → MediNist field mapping, usable by both the scraper pipeline and the Add Product form, with format-aware pack and price handling and regression tests for the edge cases.