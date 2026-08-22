CREATE OR REPLACE FUNCTION public.get_staff_presence_today()
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, role text, clock_in timestamptz, active_seconds bigint, idle_seconds bigint, last_heartbeat_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.user_id,
         p.full_name,
         p.avatar_url,
         p.role,
         MIN(s.started_at) AS clock_in,
         COALESCE(SUM(s.active_seconds), 0)::bigint AS active_seconds,
         COALESCE(SUM(s.idle_seconds), 0)::bigint AS idle_seconds,
         MAX(s.last_heartbeat_at) AS last_heartbeat_at
  FROM public.staff_shifts s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin_or_manager()
    AND s.started_at >= date_trunc('day', now())
  GROUP BY s.user_id, p.full_name, p.avatar_url, p.role
  ORDER BY MAX(s.last_heartbeat_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_staff_presence_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_presence_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_staff_activity_kpis(_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_active int; v_avg numeric; v_idle numeric; v_risk int;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin_or_manager() THEN
    RETURN jsonb_build_object('active_now', 0, 'avg_shift_seconds', 0, 'idle_seconds_today', 0, 'high_risk_today', 0);
  END IF;

  SELECT count(DISTINCT user_id) INTO v_active
  FROM public.staff_shifts
  WHERE pharmacy_id = v_pharmacy AND ended_at IS NULL
    AND last_heartbeat_at > now() - interval '3 minutes'
    AND (_user_id IS NULL OR user_id = _user_id);

  SELECT COALESCE(AVG(active_seconds), 0), COALESCE(SUM(idle_seconds), 0)
    INTO v_avg, v_idle
  FROM public.staff_shifts
  WHERE pharmacy_id = v_pharmacy AND started_at >= date_trunc('day', now())
    AND (_user_id IS NULL OR user_id = _user_id);

  SELECT count(*) INTO v_risk
  FROM public.staff_activity_logs
  WHERE pharmacy_id = v_pharmacy AND severity = 'high_risk'
    AND created_at >= date_trunc('day', now())
    AND (_user_id IS NULL OR user_id = _user_id);

  RETURN jsonb_build_object(
    'active_now', COALESCE(v_active, 0),
    'avg_shift_seconds', ROUND(COALESCE(v_avg, 0)),
    'idle_seconds_today', COALESCE(v_idle, 0),
    'high_risk_today', COALESCE(v_risk, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_staff_activity_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_activity_kpis(uuid) TO authenticated;