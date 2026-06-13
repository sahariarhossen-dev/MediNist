-- Snapshots
CREATE TABLE public._backup_spider_full_20260613 AS
  SELECT * FROM public.master_medicines;

CREATE TABLE public._backup_spider_medicines_20260613 AS
  SELECT * FROM public.medicines;

-- Progress tracker (singleton)
CREATE TABLE public.spider_sync_progress (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_offset integer NOT NULL DEFAULT 0,
  total_rows integer NOT NULL DEFAULT 0,
  matched_total integer NOT NULL DEFAULT 0,
  unmatched_total integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  finished_at timestamptz
);

GRANT ALL ON public.spider_sync_progress TO service_role;
GRANT ALL ON public._backup_spider_full_20260613 TO service_role;
GRANT ALL ON public._backup_spider_medicines_20260613 TO service_role;

ALTER TABLE public.spider_sync_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_spider_full_20260613 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_spider_medicines_20260613 ENABLE ROW LEVEL SECURITY;

-- No client policies — service role bypasses RLS, no anon/auth access needed.

INSERT INTO public.spider_sync_progress (id, next_offset, total_rows)
SELECT 1, 0, count(*) FROM public.master_medicines;