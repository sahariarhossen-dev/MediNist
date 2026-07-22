
-- 1) Truncate master catalog and reset for pure MedEx scrape
TRUNCATE TABLE public.master_medicines RESTART IDENTITY CASCADE;

-- 2) Drop match/verification tracking columns (no longer used)
ALTER TABLE public.master_medicines
  DROP COLUMN IF EXISTS medex_verified_at,
  DROP COLUMN IF EXISTS medex_status,
  DROP COLUMN IF EXISTS medex_confidence,
  DROP COLUMN IF EXISTS medex_last_attempt_at,
  DROP COLUMN IF EXISTS medex_attempts;

-- 3) Replace old sync-progress table with a pure page-cursor tracker
DROP TABLE IF EXISTS public.spider_sync_progress CASCADE;

CREATE TABLE public.medex_scrape_progress (
  id integer PRIMARY KEY DEFAULT 1,
  next_page integer NOT NULL DEFAULT 1,
  total_scraped integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  finished boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medex_scrape_progress_singleton CHECK (id = 1)
);

GRANT SELECT ON public.medex_scrape_progress TO authenticated;
GRANT ALL ON public.medex_scrape_progress TO service_role;

ALTER TABLE public.medex_scrape_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read scrape progress"
  ON public.medex_scrape_progress FOR SELECT
  TO authenticated USING (true);

INSERT INTO public.medex_scrape_progress (id, next_page) VALUES (1, 1);

-- 4) Unique key so scraper can upsert cleanly without duplicates
CREATE UNIQUE INDEX IF NOT EXISTS master_medicines_medex_url_uniq
  ON public.master_medicines (medex_url)
  WHERE medex_url IS NOT NULL;
