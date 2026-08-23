-- ============ Migration A: duty & remote-lock foundation ============

-- 1. Remote read-only lock state on staff_access
ALTER TABLE public.staff_access
  ADD COLUMN IF NOT EXISTS is_read_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_only_since timestamptz,
  ADD COLUMN IF NOT EXISTS read_only_reason text;

-- 2. Manual duty tracking columns on staff_shifts
ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS opened_by uuid,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS close_reason text;

-- close any duplicate open shifts so the one-open-shift invariant can hold
UPDATE public.staff_shifts s
   SET ended_at = COALESCE(s.last_heartbeat_at, s.started_at),
       close_reason = 'stale'
 WHERE s.ended_at IS NULL
   AND EXISTS (
     SELECT 1 FROM public.staff_shifts t
      WHERE t.user_id = s.user_id
        AND t.ended_at IS NULL
        AND t.started_at > s.started_at
   );

CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_one_open_per_user
  ON public.staff_shifts (user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_shifts_pharmacy_started_idx
  ON public.staff_shifts (pharmacy_id, started_at DESC);

-- 3. Read-only helper
CREATE OR REPLACE FUNCTION public.is_staff_read_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT sa.is_read_only
      FROM public.staff_access sa
     WHERE sa.user_id = _user_id
     LIMIT 1
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_staff_read_only(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_read_only(uuid) TO authenticated, service_role;

-- 4. Owner toggles the remote lock
CREATE OR REPLACE FUNCTION public.admin_set_staff_read_only(_user_id uuid, _on boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_target_pharmacy uuid;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin() THEN
    RAISE EXCEPTION 'Only the shop owner can change remote lock' USING ERRCODE = '42501';
  END IF;
  SELECT pharmacy_id INTO v_target_pharmacy FROM public.profiles WHERE id = _user_id;
  IF v_target_pharmacy IS DISTINCT FROM v_pharmacy THEN
    RAISE EXCEPTION 'Member not found in your shop' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot lock your own account' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_access (pharmacy_id, user_id, is_read_only, read_only_since, read_only_reason, updated_by)
  VALUES (v_pharmacy, _user_id, _on, CASE WHEN _on THEN now() END, NULLIF(_reason, ''), auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET is_read_only = EXCLUDED.is_read_only,
        read_only_since = CASE WHEN EXCLUDED.is_read_only THEN now() ELSE NULL END,
        read_only_reason = EXCLUDED.read_only_reason,
        updated_by = auth.uid(),
        updated_at = now();

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, _user_id, CASE WHEN _on THEN 'remote_lock_on' ELSE 'remote_lock_off' END,
          'staff', _user_id,
          CASE WHEN _on THEN 'App blocked by shop owner (read-only mode)' ELSE 'Remote lock removed' END,
          'audit');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_staff_read_only(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_read_only(uuid, boolean, text) TO authenticated;

-- 5. Manual clock-in / clock-out by owner or manager
CREATE OR REPLACE FUNCTION public.admin_start_shift(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_target_pharmacy uuid;
  v_shift uuid;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin_or_manager() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT pharmacy_id INTO v_target_pharmacy FROM public.profiles WHERE id = _user_id;
  IF v_target_pharmacy IS DISTINCT FROM v_pharmacy THEN
    RAISE EXCEPTION 'Member not found in your shop' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_shift FROM public.staff_shifts
   WHERE user_id = _user_id AND ended_at IS NULL LIMIT 1;
  IF v_shift IS NOT NULL THEN
    UPDATE public.staff_shifts SET source = 'manual', opened_by = COALESCE(opened_by, auth.uid())
     WHERE id = v_shift;
    RETURN v_shift;
  END IF;

  INSERT INTO public.staff_shifts (pharmacy_id, user_id, started_at, last_heartbeat_at, source, opened_by)
  VALUES (v_pharmacy, _user_id, now(), now(), 'manual', auth.uid())
  RETURNING id INTO v_shift;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, _user_id, 'shift_start', 'shift', v_shift, 'Shift started by owner/manager', 'shift');

  RETURN v_shift;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_start_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_start_shift(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_stop_shift(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_shift uuid;
  v_started timestamptz;
  v_secs int;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin_or_manager() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, started_at INTO v_shift, v_started
    FROM public.staff_shifts
   WHERE user_id = _user_id AND pharmacy_id = v_pharmacy AND ended_at IS NULL
   LIMIT 1;
  IF v_shift IS NULL THEN
    RETURN NULL;
  END IF;

  v_secs := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started))::int);

  UPDATE public.staff_shifts
     SET ended_at = now(),
         last_heartbeat_at = now(),
         active_seconds = GREATEST(active_seconds, v_secs),
         closed_by = auth.uid(),
         close_reason = 'manual'
   WHERE id = v_shift;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, _user_id, 'shift_end', 'shift', v_shift, 'Shift stopped by owner/manager', 'shift');

  RETURN v_shift;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_stop_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stop_shift(uuid) TO authenticated;

-- 6. Safety close: midnight rollover, 12h cap, stale heartbeat (auto shifts only)
CREATE OR REPLACE FUNCTION public.close_stale_shifts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.staff_shifts s
       SET ended_at = CASE
             WHEN s.started_at < date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka'
               THEN LEAST(now(), (date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka'))
             WHEN now() - s.started_at > interval '12 hours'
               THEN s.started_at + interval '12 hours'
             ELSE COALESCE(s.last_heartbeat_at, s.started_at)
           END,
           close_reason = CASE
             WHEN s.started_at < date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka' THEN 'midnight'
             WHEN now() - s.started_at > interval '12 hours' THEN 'max_hours'
             ELSE 'stale'
           END,
           active_seconds = CASE
             WHEN s.source = 'manual' THEN GREATEST(
               s.active_seconds,
               LEAST(EXTRACT(EPOCH FROM (now() - s.started_at))::int, 43200)
             )
             ELSE s.active_seconds
           END
     WHERE s.ended_at IS NULL
       AND (
         s.started_at < date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka'
         OR now() - s.started_at > interval '12 hours'
         OR (s.source <> 'manual' AND s.last_heartbeat_at < now() - interval '10 minutes')
       )
    RETURNING s.id
  ) SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

-- midnight safety pass (00:10 Asia/Dhaka = 18:10 UTC)
SELECT cron.unschedule('close-shifts-midnight') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-shifts-midnight');
SELECT cron.schedule('close-shifts-midnight', '10 18 * * *', 'SELECT public.close_stale_shifts();');