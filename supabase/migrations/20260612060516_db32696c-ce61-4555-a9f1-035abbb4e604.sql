
-- Backfill pcs_per_strip / strip_per_pack on medicines whose scraped
-- pack_size / box_size strings were never parsed into integers.
-- Idempotent: only touches rows where both columns are NULL.

WITH parsed AS (
  SELECT
    id,
    product_type,
    NULLIF(regexp_replace(coalesce(pack_size, ''), '\D', '', 'g'), '')::int AS pack_n,
    NULLIF(regexp_replace(coalesce(box_size,  ''), '\D', '', 'g'), '')::int AS box_n
  FROM public.medicines
  WHERE pcs_per_strip IS NULL
    AND strip_per_pack IS NULL
    AND (pack_size IS NOT NULL OR box_size IS NOT NULL)
)
UPDATE public.medicines m
SET
  pcs_per_strip = CASE
    WHEN p.product_type ILIKE ANY (ARRAY['tablet','capsule'])
      THEN CASE
        WHEN p.pack_n IS NOT NULL AND p.pack_n > 1 THEN p.pack_n
        WHEN p.box_n  IS NOT NULL AND p.box_n  > 1 THEN 1
        ELSE NULL
      END
    WHEN p.product_type ILIKE ANY (ARRAY['injection','vial','ampoule'])
      THEN 1
    ELSE NULL
  END,
  strip_per_pack = CASE
    WHEN p.product_type ILIKE ANY (ARRAY['tablet','capsule'])
      THEN CASE
        WHEN p.pack_n IS NOT NULL AND p.pack_n > 1
         AND p.box_n  IS NOT NULL AND p.box_n  > p.pack_n
         AND (p.box_n % p.pack_n) = 0
          THEN p.box_n / p.pack_n
        WHEN p.pack_n IS NOT NULL AND p.pack_n > 1
          THEN 1
        WHEN p.box_n IS NOT NULL AND p.box_n > 1
          THEN p.box_n
        ELSE NULL
      END
    WHEN p.product_type ILIKE ANY (ARRAY['injection','vial','ampoule'])
      THEN CASE WHEN p.box_n IS NOT NULL AND p.box_n > 1 THEN p.box_n ELSE 1 END
    ELSE NULL
  END
FROM parsed p
WHERE m.id = p.id;
