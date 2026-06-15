ALTER TABLE public.master_medicines
  ADD COLUMN IF NOT EXISTS medex_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS medex_url text,
  ADD COLUMN IF NOT EXISTS medex_status text;