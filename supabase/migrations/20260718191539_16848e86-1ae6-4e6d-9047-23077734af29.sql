
-- Phase 0: snapshot tables (safety net) + new tracking columns
CREATE TABLE IF NOT EXISTS public._backup_master_20260718 AS
  SELECT * FROM public.master_medicines;
CREATE TABLE IF NOT EXISTS public._backup_medicines_20260718 AS
  SELECT * FROM public.medicines;

GRANT ALL ON public._backup_master_20260718 TO service_role;
GRANT ALL ON public._backup_medicines_20260718 TO service_role;
ALTER TABLE public._backup_master_20260718 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_medicines_20260718 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public._backup_master_20260718
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role only" ON public._backup_medicines_20260718
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- New tracking columns on master_medicines
ALTER TABLE public.master_medicines
  ADD COLUMN IF NOT EXISTS medex_confidence text
    CHECK (medex_confidence IN ('high','medium','low','manual','none')),
  ADD COLUMN IF NOT EXISTS medex_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS medex_attempts int NOT NULL DEFAULT 0;

-- Backfill confidence for the current match set
UPDATE public.master_medicines
   SET medex_confidence = 'high'
 WHERE medex_status = 'matched' AND medex_confidence IS NULL;
UPDATE public.master_medicines
   SET medex_confidence = 'none'
 WHERE medex_status IS DISTINCT FROM 'matched' AND medex_confidence IS NULL;
