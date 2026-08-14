CREATE OR REPLACE FUNCTION public.get_pharmacy_staff_overview()
 RETURNS TABLE(user_id uuid, full_name text, avatar_url text, phone text, role text, month_sales numeric, month_count integer, monthly_target numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ph AS (
    SELECT public.get_user_pharmacy_id() AS pid
  ), month_bounds AS (
    SELECT date_trunc('month', now()) AS start_ts,
           (date_trunc('month', now()) + interval '1 month' - interval '1 microsecond') AS end_ts
  )
  SELECT
    p.id AS user_id,
    p.full_name,
    p.avatar_url,
    p.phone,
    p.role,
    COALESCE(s.month_sales, 0) AS month_sales,
    COALESCE(s.month_count, 0)::int AS month_count,
    COALESCE(ss.monthly_target, 0) AS monthly_target
  FROM public.profiles p
  CROSS JOIN ph
  CROSS JOIN month_bounds mb
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(total), 0) AS month_sales,
           COUNT(*) AS month_count
    FROM public.sales
    WHERE pharmacy_id = ph.pid
      AND user_id = p.id
      AND status = 'completed'
      AND created_at >= mb.start_ts
      AND created_at <= mb.end_ts
  ) s ON true
  LEFT JOIN public.staff_settings ss
    ON ss.pharmacy_id = ph.pid AND ss.user_id = p.id
  WHERE p.pharmacy_id = ph.pid
    AND auth.uid() IS NOT NULL
    AND (public.is_pharmacy_admin_or_manager() OR p.id = auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() TO authenticated;