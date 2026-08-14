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
       pcs_per_strip,
       strip_per_pack
FROM public.master_medicines_import
WHERE btrim(coalesce(brand_name,'')) <> '';

COMMIT;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_master_medicines_search_vector ON public.master_medicines USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_master_medicines_company       ON public.master_medicines (company);
CREATE INDEX IF NOT EXISTS idx_master_brand_norm   ON public.master_medicines ((regexp_replace(lower(brand_name), '[^a-z0-9]', '', 'g')) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_master_generic_norm ON public.master_medicines ((regexp_replace(lower(coalesce(generic_name,'')), '[^a-z0-9]', '', 'g')) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_master_brand_trgm   ON public.master_medicines USING gin (brand_name gin_trgm_ops);

ANALYZE public.master_medicines;

DROP TABLE IF EXISTS public.master_medicines_import;
DROP FUNCTION IF EXISTS public.truncate_master_import();