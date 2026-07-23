DROP INDEX IF EXISTS public.master_medicines_medex_url_uniq;
ALTER TABLE public.master_medicines ADD CONSTRAINT master_medicines_medex_url_key UNIQUE (medex_url);