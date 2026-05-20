ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS generic_name text,
  ADD COLUMN IF NOT EXISTS strength    text,
  ADD COLUMN IF NOT EXISTS format      text,
  ADD COLUMN IF NOT EXISTS pack_size   text,
  ADD COLUMN IF NOT EXISTS box_size    text;