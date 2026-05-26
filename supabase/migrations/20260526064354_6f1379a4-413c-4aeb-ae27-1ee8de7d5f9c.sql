ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS packaging_type text;

ALTER TABLE public.medicines
  DROP CONSTRAINT IF EXISTS medicines_packaging_type_check;
ALTER TABLE public.medicines
  ADD CONSTRAINT medicines_packaging_type_check
  CHECK (packaging_type IS NULL OR packaging_type IN ('single','strip_based'));

-- Backfill: only true tablet/capsule strip-in-box products are strip_based.
UPDATE public.medicines
SET packaging_type = 'strip_based'
WHERE packaging_type IS NULL
  AND COALESCE(pcs_per_strip, 0) > 1
  AND COALESCE(strip_per_pack, 0) > 1
  AND (
       lower(COALESCE(product_type,'')) ~ '\b(tablet|tabs?|capsule|caps?|softgel|soft\s*gelatin|bolus)\b'
    OR lower(COALESCE(unit_format,'')) ~ '\b(tablet|tabs?|capsule|caps?|softgel|soft\s*gelatin|bolus)\b'
  );

-- Everything else is a single unit (pot, drop, syrup, inhaler, cream, ointment,
-- single-pack tablets like Allion Gold, etc.).
UPDATE public.medicines
SET packaging_type = 'single'
WHERE packaging_type IS NULL;