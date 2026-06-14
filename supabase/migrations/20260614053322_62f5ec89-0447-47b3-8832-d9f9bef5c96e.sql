-- Backfill: fix swapped strip_per_pack / pcs_per_strip for rows whose
-- pack_size text follows the MedEx "NxM" convention (N strips x M pcs).
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

-- Mirror the corrected values into per-pharmacy medicines, matched by
-- (lower(name), lower(company_name)) like admin_resync_medicines_pack_info.
WITH cat AS (
  SELECT DISTINCT ON (lower(brand_name), lower(coalesce(company,'')))
    brand_name, company, pcs_per_strip, strip_per_pack
  FROM public.master_medicines
  WHERE pack_size ~ '\d+\s*[xX×]\s*\d+'
  ORDER BY lower(brand_name), lower(coalesce(company,'')),
           strip_per_pack DESC NULLS LAST, pcs_per_strip DESC NULLS LAST
)
UPDATE public.medicines m
SET pcs_per_strip  = c.pcs_per_strip,
    strip_per_pack = c.strip_per_pack
FROM cat c
WHERE lower(m.name) = lower(c.brand_name)
  AND lower(coalesce(m.company_name,'')) = lower(coalesce(c.company,''))
  AND (m.pcs_per_strip  IS DISTINCT FROM c.pcs_per_strip
    OR m.strip_per_pack IS DISTINCT FROM c.strip_per_pack);