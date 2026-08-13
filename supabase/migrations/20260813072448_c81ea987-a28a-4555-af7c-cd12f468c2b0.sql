-- Migration A: drop obsolete backup/staging tables
DROP TABLE IF EXISTS public._backup_master_20260718           CASCADE;
DROP TABLE IF EXISTS public._backup_master_pack_20260612      CASCADE;
DROP TABLE IF EXISTS public._backup_medicines_20260718        CASCADE;
DROP TABLE IF EXISTS public._backup_medicines_pack_20260612   CASCADE;
DROP TABLE IF EXISTS public._backup_spider_full_20260613      CASCADE;
DROP TABLE IF EXISTS public._backup_spider_medicines_20260613 CASCADE;
DROP TABLE IF EXISTS public._stg_medicines_new                CASCADE;

-- Retire the MedEx scraper surface
DROP TABLE IF EXISTS public.medex_cache           CASCADE;
DROP TABLE IF EXISTS public.medex_scrape_progress CASCADE;
ALTER TABLE public.master_medicines
  DROP CONSTRAINT IF EXISTS master_medicines_medex_url_key,
  DROP COLUMN IF EXISTS medex_url;

-- Stop the scraper cron jobs (ignore if already gone)
DO $$
BEGIN
  PERFORM cron.unschedule('medex-scraper-auto');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('medex-refresh-reset');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- B1: staging table for the clean master import
CREATE TABLE IF NOT EXISTS public.master_medicines_import (
  brand_name     text,
  generic_name   text,
  strength       text,
  unit_price     numeric,
  company        text,
  format         text,
  pack_size      text,
  box_size       text,
  pcs_per_strip  integer,
  strip_per_pack integer
);
GRANT ALL ON public.master_medicines_import TO service_role;
ALTER TABLE public.master_medicines_import ENABLE ROW LEVEL SECURITY;