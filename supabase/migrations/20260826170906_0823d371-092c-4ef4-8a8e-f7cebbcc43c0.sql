ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS break_seconds int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_break_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_pause_shift(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_shift uuid;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin_or_manager() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_shift
    FROM public.staff_shifts
   WHERE user_id = _user_id AND pharmacy_id = v_pharmacy
     AND ended_at IS NULL AND current_break_started_at IS NULL
   ORDER BY started_at DESC LIMIT 1;

  IF v_shift IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.staff_shifts
     SET current_break_started_at = now(),
         last_heartbeat_at = now()
   WHERE id = v_shift;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, _user_id, 'shift_pause', 'shift', v_shift, 'Break started', 'shift');

  RETURN v_shift;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resume_shift(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_shift uuid;
  v_break_start timestamptz;
  v_secs int;
  v_label text;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin_or_manager() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, current_break_started_at INTO v_shift, v_break_start
    FROM public.staff_shifts
   WHERE user_id = _user_id AND pharmacy_id = v_pharmacy
     AND ended_at IS NULL AND current_break_started_at IS NOT NULL
   ORDER BY started_at DESC LIMIT 1;

  IF v_shift IS NULL THEN
    RETURN NULL;
  END IF;

  v_secs := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_break_start))::int);

  UPDATE public.staff_shifts
     SET break_seconds = break_seconds + v_secs,
         current_break_started_at = NULL,
         last_heartbeat_at = now()
   WHERE id = v_shift;

  v_label := CASE
    WHEN v_secs >= 3600 THEN (v_secs / 3600)::text || 'h ' || ((v_secs % 3600) / 60)::text || 'm'
    ELSE GREATEST(1, v_secs / 60)::text || 'm'
  END;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, _user_id, 'shift_resume', 'shift', v_shift,
          'Resumed duty after ' || v_label || ' break', 'shift');

  RETURN v_shift;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_stop_shift(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_shift uuid;
  v_started timestamptz;
  v_break_start timestamptz;
  v_secs int;
  v_break int := 0;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin_or_manager() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, started_at, current_break_started_at
    INTO v_shift, v_started, v_break_start
    FROM public.staff_shifts
   WHERE user_id = _user_id AND pharmacy_id = v_pharmacy AND ended_at IS NULL
   LIMIT 1;
  IF v_shift IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_break_start IS NOT NULL THEN
    v_break := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_break_start))::int);
  END IF;

  v_secs := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started))::int);

  UPDATE public.staff_shifts
     SET ended_at = now(),
         last_heartbeat_at = now(),
         active_seconds = GREATEST(active_seconds, v_secs),
         break_seconds = break_seconds + v_break,
         current_break_started_at = NULL,
         closed_by = auth.uid(),
         close_reason = 'manual'
   WHERE id = v_shift;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, _user_id, 'shift_end', 'shift', v_shift, 'Shift stopped by owner/manager', 'shift');

  RETURN v_shift;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_duty_summary(_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_me uuid := auth.uid();
  v_target uuid := _user_id;
  v_day_start timestamptz := date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka';
  v_month_start timestamptz := date_trunc('month', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka';
  v_inv_today int := 0; v_amt_today numeric := 0;
  v_inv_month int := 0; v_amt_month numeric := 0;
  v_secs_today numeric := 0; v_secs_month numeric := 0;
  v_break_today numeric := 0; v_break_month numeric := 0;
  v_pending_del int := 0; v_pending_disc int := 0;
  v_read_only boolean := false;
  v_shift_id uuid; v_shift_started timestamptz; v_break_started timestamptz;
BEGIN
  IF v_pharmacy IS NULL OR v_me IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  IF NOT public.is_pharmacy_admin_or_manager() THEN
    v_target := v_me;
  END IF;

  SELECT count(*), COALESCE(SUM(total), 0) INTO v_inv_today, v_amt_today
    FROM public.sales
   WHERE pharmacy_id = v_pharmacy AND status = 'completed'
     AND created_at >= v_day_start
     AND (v_target IS NULL OR user_id = v_target);

  SELECT count(*), COALESCE(SUM(total), 0) INTO v_inv_month, v_amt_month
    FROM public.sales
   WHERE pharmacy_id = v_pharmacy AND status = 'completed'
     AND created_at >= v_month_start
     AND (v_target IS NULL OR user_id = v_target);

  SELECT
      COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)), 43200)), 0),
      COALESCE(SUM(break_seconds + CASE WHEN current_break_started_at IS NOT NULL
                                        THEN EXTRACT(EPOCH FROM (now() - current_break_started_at))
                                        ELSE 0 END), 0)
    INTO v_secs_today, v_break_today
    FROM public.staff_shifts
   WHERE pharmacy_id = v_pharmacy AND started_at >= v_day_start
     AND (v_target IS NULL OR user_id = v_target);

  SELECT
      COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)), 43200)), 0),
      COALESCE(SUM(break_seconds + CASE WHEN current_break_started_at IS NOT NULL
                                        THEN EXTRACT(EPOCH FROM (now() - current_break_started_at))
                                        ELSE 0 END), 0)
    INTO v_secs_month, v_break_month
    FROM public.staff_shifts
   WHERE pharmacy_id = v_pharmacy AND started_at >= v_month_start
     AND (v_target IS NULL OR user_id = v_target);

  SELECT count(*) FILTER (WHERE entity_type = 'medicine'),
         count(*) FILTER (WHERE entity_type = 'sale')
    INTO v_pending_del, v_pending_disc
    FROM public.admin_override_requests
   WHERE pharmacy_id = v_pharmacy AND status = 'pending'
     AND (v_target IS NULL OR requested_by = v_target);

  IF v_target IS NOT NULL THEN
    SELECT COALESCE(is_read_only, false) INTO v_read_only
      FROM public.staff_access WHERE user_id = v_target LIMIT 1;
    SELECT id, started_at, current_break_started_at
      INTO v_shift_id, v_shift_started, v_break_started
      FROM public.staff_shifts
     WHERE pharmacy_id = v_pharmacy AND user_id = v_target AND ended_at IS NULL
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'invoices_today', v_inv_today,
    'sales_amount_today', ROUND(COALESCE(v_amt_today, 0), 2),
    'invoices_month', v_inv_month,
    'sales_amount_month', ROUND(COALESCE(v_amt_month, 0), 2),
    'duty_seconds_today', GREATEST(0, ROUND(COALESCE(v_secs_today, 0) - COALESCE(v_break_today, 0))),
    'duty_seconds_month', GREATEST(0, ROUND(COALESCE(v_secs_month, 0) - COALESCE(v_break_month, 0))),
    'break_seconds_today', ROUND(COALESCE(v_break_today, 0)),
    'break_seconds_month', ROUND(COALESCE(v_break_month, 0)),
    'pending_deletions', COALESCE(v_pending_del, 0),
    'pending_discounts', COALESCE(v_pending_disc, 0),
    'is_read_only', COALESCE(v_read_only, false),
    'shift_open', v_shift_id IS NOT NULL,
    'shift_started_at', v_shift_started,
    'on_break', v_break_started IS NOT NULL,
    'break_started_at', v_break_started
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_pause_shift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resume_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pause_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_shift(uuid) TO authenticated;