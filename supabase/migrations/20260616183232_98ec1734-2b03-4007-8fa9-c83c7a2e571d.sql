REVOKE SELECT (token) ON public.shop_staff FROM PUBLIC;
REVOKE SELECT (token) ON public.shop_staff FROM anon;
REVOKE SELECT (token) ON public.shop_staff FROM authenticated;