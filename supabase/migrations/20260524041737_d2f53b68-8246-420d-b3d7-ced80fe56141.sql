CREATE OR REPLACE VIEW public.unique_companies AS
SELECT DISTINCT company
FROM public.master_medicines
WHERE company IS NOT NULL AND company <> ''
ORDER BY company ASC;

GRANT SELECT ON public.unique_companies TO authenticated, anon;