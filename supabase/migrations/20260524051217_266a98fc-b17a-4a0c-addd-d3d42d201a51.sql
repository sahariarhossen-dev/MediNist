ALTER TABLE public.master_medicines
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(brand_name, '')),   'A') ||
  setweight(to_tsvector('simple', coalesce(generic_name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(company, '')),      'C')
) STORED;

CREATE INDEX IF NOT EXISTS idx_master_medicines_search_vector
  ON public.master_medicines
  USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_master_medicines_company
  ON public.master_medicines (company);