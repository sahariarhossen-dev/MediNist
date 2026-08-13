# Master Medicine Table Reset — Audit, SQL & Import Blueprint

Note on stack: this project is a **React web app (Vite + TypeScript)**, not React Native. All data access goes through `@supabase/supabase-js` from `src/`.

## 1. Codebase audit — what the app actually reads

Only **two** medicine tables are touched by app code:

| Table | Used by | Notes |
|---|---|---|
| `public.master_medicines` | `src/pages/CatalogSearch.tsx` (`select *`), `src/pages/Inventory.tsx` (company list, paginated 1000/page), `src/pages/AddProduct.tsx` (pack self-heal lookup by `brand_name` + `company`) | The catalog/master table |
| `public.medicines` | Inventory, AddProduct, CreateSale, Index, `src/lib/productType.ts` | Per-pharmacy stock — **must not be touched** |

Two RPCs also read the master table and must keep working: `search_master_medicines(_query, _companies, _limit)` (declared `RETURNS SETOF master_medicines`, so the column list must stay compatible) and `get_master_companies(_search)`. The view `public.unique_companies` also selects from it, and `admin_resync_medicines_pack_info()` joins master → medicines.

Exact current structure of `public.master_medicines` (26,263 rows, 16 MB) — the contract to reproduce:

```text
id             uuid    NOT NULL  default gen_random_uuid()   PRIMARY KEY
brand_name     text    NOT NULL
generic_name   text    NULL
strength       text    NULL
unit_price     numeric NULL      default 0
company        text    NULL
format         text    NULL
pack_size      text    NULL
box_size       text    NULL
created_at     timestamptz NULL  default now()
search_vector  tsvector NULL
pcs_per_strip  integer NULL
strip_per_pack integer NULL
medex_url      text    NULL      UNIQUE   <- only needed by the scraper
```

No foreign keys in or out. Indexes today: PK on `id`, unique on `medex_url`, GIN on `search_vector`, btree on `company`. RLS today: SELECT allowed for `authenticated` (`true`); INSERT/UPDATE/DELETE denied to clients (the scraper wrote via service role).

## 2. Cleanup list — safe to drop

Zero references from `src/` (only historical migration files mention them):

- `_backup_master_20260718` (7.2 MB)
- `_backup_master_pack_20260612` (5.7 MB)
- `_backup_medicines_20260718`
- `_backup_medicines_pack_20260612`
- `_backup_spider_full_20260613` (6.2 MB)
- `_backup_spider_medicines_20260613`
- `_stg_medicines_new` (0 rows)

Because you chose to **retire the MedEx scraper**, these also go: `medex_cache` (2 rows), `medex_scrape_progress`, the `medex_url` column + unique constraint, the `medex-scraper` edge function, and its two cron jobs (`medex-scraper-auto`, `medex-refresh-reset`). Keep `master_medicines`, `medicines`, `companies`, and the `unique_companies` view.

## 3. Execution roadmap (risk-free order)

1. **Snapshot first** — export the current `master_medicines` to CSV from the Supabase dashboard (Table editor → Export) and keep it locally. This is the rollback.
2. **Freeze writes** — unschedule the two MedEx cron jobs and delete the scraper function so nothing writes mid-migration.
3. **Prepare the import file** — send the JSON/XLSX; it is converted to a UTF-8 CSV with header exactly `brand_name,generic_name,strength,unit_price,company,format,pack_size,box_size,pcs_per_strip,strip_per_pack` (no `id`, no `search_vector` — both generated). You get a pre-load report: row count, duplicate `brand_name + company + strength` groups, bad numerics, rows missing a brand name.
4. **Run migration A** — drop backup/staging tables and the scraper surface. Nothing app-facing changes.
5. **Load into staging** `public.master_medicines_import` (not the live table), via the dashboard CSV importer or `psql \copy` in 5k-row chunks. The catalog keeps serving old data during this step.
6. **Verify staging** — count, 20-row sample, null-brand check, duplicate check.
7. **Run migration B (the swap)** — in one transaction: truncate `master_medicines`, insert from staging, rebuild `search_vector`; then drop staging. One transaction means readers never see an empty catalog.
8. **Post-checks** — row count, `search_master_medicines('napa', null, 20)`, `get_master_companies('be')`, plus an app pass through Inventory search, Add-from-Catalog, and AddProduct edit.

## 4. SQL scripts

### Migration A — cleanup (run first)

```sql
BEGIN;

DROP TABLE IF EXISTS public._backup_master_20260718           CASCADE;
DROP TABLE IF EXISTS public._backup_master_pack_20260612      CASCADE;
DROP TABLE IF EXISTS public._backup_medicines_20260718        CASCADE;
DROP TABLE IF EXISTS public._backup_medicines_pack_20260612   CASCADE;
DROP TABLE IF EXISTS public._backup_spider_full_20260613      CASCADE;
DROP TABLE IF EXISTS public._backup_spider_medicines_20260613 CASCADE;
DROP TABLE IF EXISTS public._stg_medicines_new                CASCADE;

-- Retire the MedEx scraper surface
DROP TABLE IF EXISTS public.medex_cache           CASCADE;
DROP TABLE IF EXISTS public.medex_scrape_progress CASCADE;
ALTER TABLE public.master_medicines
  DROP CONSTRAINT IF EXISTS master_medicines_medex_url_key,
  DROP COLUMN IF EXISTS medex_url;

COMMIT;
```

Plus, outside that transaction: `select cron.unschedule('medex-scraper-auto'); select cron.unschedule('medex-refresh-reset');`

### Migration B — staging, swap, indexes, RLS

```sql
-- B1. staging table for the import (dropped at the end)
CREATE TABLE IF NOT EXISTS public.master_medicines_import (
  brand_name     text,
  generic_name   text,
  strength       text,
  unit_price     numeric,
  company        text,
  format         text,
  pack_size      text,
  box_size       text,
  pcs_per_strip  integer,
  strip_per_pack integer
);
GRANT ALL ON public.master_medicines_import TO service_role;
ALTER TABLE public.master_medicines_import ENABLE ROW LEVEL SECURITY;
-- no policies: service_role / SQL editor only

-- >>> load the CSV into master_medicines_import here, then verify <<<

-- B2. atomic swap
BEGIN;
TRUNCATE public.master_medicines;
INSERT INTO public.master_medicines
  (brand_name, generic_name, strength, unit_price, company, format,
   pack_size, box_size, pcs_per_strip, strip_per_pack)
SELECT btrim(brand_name),
       nullif(btrim(coalesce(generic_name,'')),''),
       nullif(btrim(coalesce(strength,'')),''),
       coalesce(unit_price,0),
       nullif(btrim(coalesce(company,'')),''),
       nullif(btrim(coalesce(format,'')),''),
       nullif(btrim(coalesce(pack_size,'')),''),
       nullif(btrim(coalesce(box_size,'')),''),
       pcs_per_strip, strip_per_pack
FROM public.master_medicines_import
WHERE btrim(coalesce(brand_name,'')) <> '';

UPDATE public.master_medicines
SET search_vector = to_tsvector('simple',
      coalesce(brand_name,'') || ' ' || coalesce(generic_name,'') || ' ' || coalesce(company,''));
COMMIT;

DROP TABLE public.master_medicines_import;

-- B3. indexes for fast search
CREATE INDEX IF NOT EXISTS idx_master_medicines_search_vector ON public.master_medicines USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_master_medicines_company       ON public.master_medicines (company);
CREATE INDEX IF NOT EXISTS idx_master_brand_norm   ON public.master_medicines ((regexp_replace(lower(brand_name), '[^a-z0-9]', '', 'g')) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_master_generic_norm ON public.master_medicines ((regexp_replace(lower(coalesce(generic_name,'')), '[^a-z0-9]', '', 'g')) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_master_brand_trgm   ON public.master_medicines USING gin (brand_name gin_trgm_ops); -- needs pg_trgm
ANALYZE public.master_medicines;

-- B4. RLS / grants (read-only for the app, unchanged shape)
GRANT SELECT ON public.master_medicines TO authenticated;
GRANT ALL    ON public.master_medicines TO service_role;
ALTER TABLE public.master_medicines ENABLE ROW LEVEL SECURITY;
-- existing policies already cover this; recreate only if the table is rebuilt:
--   SELECT: to authenticated USING (true)
--   INSERT/UPDATE/DELETE: denied (WITH CHECK false / USING false)
```

Note on `anon`: the catalog is read only from authenticated screens, and a recent security pass deliberately removed anon reads across the project, so `anon` stays without SELECT. A truly public pre-login catalog would be a separate, explicit decision.

## 5. Import & pagination strategy

- Import via CSV, not one giant `INSERT` — the SQL editor and PostgREST both time out on multi-MB statements. Dashboard importer or `psql \copy` in 5,000-row chunks; ~26k rows loads in seconds.
- `id` is omitted from the CSV so `gen_random_uuid()` fills it; `search_vector` is rebuilt in SQL, never imported.
- The 1000-row PostgREST cap is already handled in most of the app: `Inventory.tsx` pages the company list with `.range()` in 1000-row windows, and the catalog list uses `search_master_medicines` with an explicit `_limit: 500`. **One gap:** `src/pages/CatalogSearch.tsx` does `select("*")` with no range, so it only ever sees the first 1000 catalog rows and filters client-side. Recommended minor, safe change: switch that page to the same debounced `search_master_medicines` RPC Inventory uses. That is the only app-side edit in this plan.

## 6. Deliverables

- Migration A applied (cleanup + scraper retirement), cron jobs unscheduled, `medex-scraper` edge function deleted.
- Your JSON/XLSX converted to a validated CSV plus a pre-load data-quality report.
- Migration B applied (staging → atomic swap → indexes → RLS verification).
- `CatalogSearch.tsx` moved onto the RPC so no catalog row is hidden by the 1000-row cap.
- Post-migration verification output: row counts, RPC smoke tests, and an app pass over Inventory / Catalog / AddProduct.