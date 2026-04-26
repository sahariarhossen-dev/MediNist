-- Add unit_format column to medicines for verbatim display label
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS unit_format text;

-- Backfill unit_format from existing product_type so display stays consistent
UPDATE public.medicines
SET unit_format = product_type
WHERE unit_format IS NULL AND product_type IS NOT NULL;

-- Normalize existing product_type values to canonical functional types
UPDATE public.medicines
SET product_type = CASE
  WHEN product_type IS NULL THEN NULL
  WHEN lower(product_type) LIKE '%tablet%' THEN 'Tablet'
  WHEN lower(product_type) LIKE '%capsule%' THEN 'Capsule'
  WHEN lower(product_type) LIKE '%suspension%' OR lower(product_type) LIKE '%syrup%' THEN 'Syrup'
  ELSE product_type
END
WHERE product_type IS NOT NULL;