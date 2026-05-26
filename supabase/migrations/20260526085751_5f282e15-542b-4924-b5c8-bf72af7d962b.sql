WITH parsed AS (
  SELECT
    m.id,
    NULLIF(substring(mm.box_size  from '(\d+)'), '')::int AS box_n,
    NULLIF(substring(mm.pack_size from '(\d+)'), '')::int AS pack_n
  FROM medicines m
  JOIN master_medicines mm
    ON lower(m.name) = lower(mm.brand_name)
   AND lower(coalesce(m.company_name,'')) = lower(coalesce(mm.company,''))
   AND lower(coalesce(m.product_type,'')) = lower(coalesce(mm.format,''))
  WHERE m.pcs_per_strip IS NULL
    AND m.strip_per_pack IS NULL
)
UPDATE medicines m
SET pcs_per_strip = parsed.pack_n,
    strip_per_pack = CASE
      WHEN parsed.box_n > 1 AND parsed.pack_n > 1 AND (parsed.box_n / parsed.pack_n) > 1
        THEN parsed.box_n / parsed.pack_n
      ELSE NULL
    END
FROM parsed
WHERE m.id = parsed.id
  AND parsed.box_n > 1
  AND parsed.pack_n > 1
  AND (parsed.box_n / parsed.pack_n) > 1;