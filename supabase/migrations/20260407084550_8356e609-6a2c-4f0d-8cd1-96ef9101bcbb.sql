ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS default_discount numeric DEFAULT 10;