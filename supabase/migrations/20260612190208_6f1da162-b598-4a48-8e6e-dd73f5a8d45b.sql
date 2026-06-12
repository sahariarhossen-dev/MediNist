ALTER TABLE public.master_medicines
  ADD COLUMN IF NOT EXISTS pcs_per_strip integer,
  ADD COLUMN IF NOT EXISTS strip_per_pack integer;