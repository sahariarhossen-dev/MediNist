REVOKE EXECUTE ON FUNCTION public.complete_sale(jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb) TO authenticated, service_role;