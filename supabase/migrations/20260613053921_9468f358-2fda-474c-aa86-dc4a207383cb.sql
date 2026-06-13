CREATE OR REPLACE FUNCTION public.get_master_companies(_search text DEFAULT NULL)
RETURNS TABLE(name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT company AS name
  FROM public.master_medicines
  WHERE company IS NOT NULL
    AND btrim(company) <> ''
    AND (_search IS NULL OR btrim(_search) = '' OR company ILIKE '%' || _search || '%')
  ORDER BY name ASC
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.get_master_companies(text) TO authenticated;