CREATE OR REPLACE FUNCTION public.admin_truncate_master_medicines()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  TRUNCATE public.master_medicines;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_truncate_master_medicines() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_resync_medicines_pack_info()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH cat AS (
    SELECT DISTINCT ON (lower(brand_name), lower(coalesce(company,'')))
      brand_name, company, generic_name, strength, format, pack_size, box_size,
      pcs_per_strip, strip_per_pack
    FROM public.master_medicines
    ORDER BY lower(brand_name), lower(coalesce(company,'')),
             strip_per_pack DESC NULLS LAST, pcs_per_strip DESC NULLS LAST
  ), upd AS (
    UPDATE public.medicines m
    SET pcs_per_strip  = c.pcs_per_strip,
        strip_per_pack = c.strip_per_pack,
        format         = COALESCE(NULLIF(m.format,''), c.format),
        pack_size      = COALESCE(NULLIF(m.pack_size,''), c.pack_size),
        box_size       = COALESCE(NULLIF(m.box_size,''), c.box_size),
        strength       = COALESCE(NULLIF(m.strength,''), c.strength),
        generic_name   = COALESCE(NULLIF(m.generic_name,''), c.generic_name)
    FROM cat c
    WHERE lower(m.name) = lower(c.brand_name)
      AND lower(coalesce(m.company_name,'')) = lower(coalesce(c.company,''))
    RETURNING m.id
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_resync_medicines_pack_info() FROM PUBLIC, anon, authenticated;