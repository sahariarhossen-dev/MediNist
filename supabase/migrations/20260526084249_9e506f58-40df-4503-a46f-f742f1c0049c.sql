-- Heal legacy single-unit medicine rows so the STK label renders as a flat integer.
-- 1) Catalog-matched rows whose master_medicines.box_size is missing or <= 1.
UPDATE medicines m
SET pcs_per_strip = NULL,
    strip_per_pack = NULL
FROM master_medicines mm
WHERE m.name = mm.brand_name
  AND COALESCE(m.company_name, '') = COALESCE(mm.company, '')
  AND (
    mm.box_size IS NULL
    OR mm.box_size = ''
    OR mm.box_size = 'N/A'
    OR substring(mm.box_size from '^\s*(\d+)')::int <= 1
  );

-- 2) Orphan rows (no catalog match) that are obvious single units by product_type
--    and have no box subdivision recorded.
UPDATE medicines
SET pcs_per_strip = NULL
WHERE strip_per_pack IS NULL
  AND product_type ILIKE ANY (ARRAY[
    '%drop%','%syrup%','%suspension%','%cream%','%ointment%',
    '%gel%','%lotion%','%inhaler%','%spray%','%solution%','%shampoo%'
  ]);