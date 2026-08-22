-- ============ 1. staff_shifts ============
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  active_seconds integer NOT NULL DEFAULT 0,
  idle_seconds integer NOT NULL DEFAULT 0,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_shifts_admin_read" ON public.staff_shifts
  FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin_or_manager());
CREATE POLICY "staff_shifts_self_read" ON public.staff_shifts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS staff_shifts_pharmacy_started_idx
  ON public.staff_shifts (pharmacy_id, started_at DESC);
CREATE INDEX IF NOT EXISTS staff_shifts_open_idx
  ON public.staff_shifts (user_id, ended_at);

-- ============ 2. staff_sessions ============
CREATE TABLE IF NOT EXISTS public.staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL UNIQUE,
  os text,
  browser text,
  device_type text,
  ip_hash text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
GRANT SELECT ON public.staff_sessions TO authenticated;
GRANT ALL ON public.staff_sessions TO service_role;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_sessions_admin_read" ON public.staff_sessions
  FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());
CREATE POLICY "staff_sessions_self_read" ON public.staff_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS staff_sessions_pharmacy_idx
  ON public.staff_sessions (pharmacy_id, last_seen_at DESC);

-- ============ 3. staff_security_settings ============
CREATE TABLE IF NOT EXISTS public.staff_security_settings (
  pharmacy_id uuid PRIMARY KEY,
  pin_lock_enabled boolean NOT NULL DEFAULT false,
  grace_seconds integer NOT NULL DEFAULT 60,
  ip_restriction_enabled boolean NOT NULL DEFAULT false,
  allowed_ip_hashes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.staff_security_settings TO authenticated;
GRANT INSERT, UPDATE ON public.staff_security_settings TO authenticated;
GRANT ALL ON public.staff_security_settings TO service_role;
ALTER TABLE public.staff_security_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_settings_member_read" ON public.staff_security_settings
  FOR SELECT TO authenticated USING (pharmacy_id = public.get_user_pharmacy_id());
CREATE POLICY "security_settings_admin_insert" ON public.staff_security_settings
  FOR INSERT TO authenticated
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());
CREATE POLICY "security_settings_admin_update" ON public.staff_security_settings
  FOR UPDATE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

-- ============ 4. staff_pins (hash never readable) ============
CREATE TABLE IF NOT EXISTS public.staff_pins (
  user_id uuid PRIMARY KEY,
  pharmacy_id uuid NOT NULL,
  pin_hash text NOT NULL,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_pins TO service_role;
ALTER TABLE public.staff_pins ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated on purpose: access only via security definer functions.

-- ============ 5. activity log severity ============
ALTER TABLE public.staff_activity_logs
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';

CREATE INDEX IF NOT EXISTS staff_activity_pharmacy_created_idx
  ON public.staff_activity_logs (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_activity_pharmacy_severity_idx
  ON public.staff_activity_logs (pharmacy_id, severity, created_at DESC);

-- ============ 6. heartbeat ============
CREATE OR REPLACE FUNCTION public.heartbeat_shift(
  _session_id uuid,
  _active_delta integer DEFAULT 0,
  _idle_delta integer DEFAULT 0,
  _device jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
  v_shift uuid;
  v_active int := GREATEST(0, LEAST(COALESCE(_active_delta, 0), 900));
  v_idle int := GREATEST(0, LEAST(COALESCE(_idle_delta, 0), 900));
BEGIN
  IF v_user IS NULL OR _session_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.staff_sessions (pharmacy_id, user_id, session_id, os, browser, device_type)
  VALUES (v_pharmacy, v_user, _session_id,
          NULLIF(_device->>'os',''), NULLIF(_device->>'browser',''), NULLIF(_device->>'device_type',''))
  ON CONFLICT (session_id) DO UPDATE
    SET last_seen_at = now(),
        os = COALESCE(EXCLUDED.os, public.staff_sessions.os),
        browser = COALESCE(EXCLUDED.browser, public.staff_sessions.browser),
        device_type = COALESCE(EXCLUDED.device_type, public.staff_sessions.device_type);

  SELECT id INTO v_shift
  FROM public.staff_shifts
  WHERE user_id = v_user AND session_id = _session_id AND ended_at IS NULL
    AND last_heartbeat_at > now() - interval '10 minutes'
  ORDER BY started_at DESC LIMIT 1;

  IF v_shift IS NULL THEN
    INSERT INTO public.staff_shifts (pharmacy_id, user_id, session_id, device_label, active_seconds, idle_seconds)
    VALUES (v_pharmacy, v_user, _session_id,
            COALESCE(NULLIF(_device->>'browser',''), 'Unknown') || ' · ' || COALESCE(NULLIF(_device->>'os',''), 'Device'),
            v_active, v_idle)
    RETURNING id INTO v_shift;

    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
    VALUES (v_pharmacy, v_user, 'shift_start', 'staff_shift', v_shift,
            'Clocked in · ' || COALESCE(NULLIF(_device->>'browser',''), 'Unknown') || ' / ' || COALESCE(NULLIF(_device->>'os',''), 'Device'),
            'shift');
  ELSE
    UPDATE public.staff_shifts
       SET active_seconds = active_seconds + v_active,
           idle_seconds = idle_seconds + v_idle,
           last_heartbeat_at = now()
     WHERE id = v_shift;
  END IF;

  UPDATE public.profiles SET last_seen = now() WHERE id = v_user;
  RETURN v_shift;
END;
$$;
REVOKE ALL ON FUNCTION public.heartbeat_shift(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_shift(uuid, integer, integer, jsonb) TO authenticated;

-- ============ 7. close stale shifts ============
CREATE OR REPLACE FUNCTION public.close_stale_shifts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.staff_shifts
       SET ended_at = last_heartbeat_at
     WHERE ended_at IS NULL
       AND last_heartbeat_at < now() - interval '10 minutes'
    RETURNING id
  ) SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.close_stale_shifts() FROM PUBLIC, anon, authenticated;

-- ============ 8. PIN functions ============
CREATE OR REPLACE FUNCTION public.set_staff_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits' USING ERRCODE = '22023';
  END IF;
  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy linked to your account' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_pins (user_id, pharmacy_id, pin_hash, failures, locked_until, updated_at)
  VALUES (v_user, v_pharmacy, crypt(_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, pharmacy_id = EXCLUDED.pharmacy_id,
        failures = 0, locked_until = NULL, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_staff_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_pin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_staff_pin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_pins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.has_staff_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_staff_pin() TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_staff_pin(_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.staff_pins%ROWTYPE;
  v_ok boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_row FROM public.staff_pins WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_set');
  END IF;
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_row.locked_until);
  END IF;

  v_ok := (v_row.pin_hash = crypt(COALESCE(_pin, ''), v_row.pin_hash));

  IF v_ok THEN
    UPDATE public.staff_pins SET failures = 0, locked_until = NULL WHERE user_id = v_user;
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.staff_pins
     SET failures = failures + 1,
         locked_until = CASE WHEN failures + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE user_id = v_user
   RETURNING * INTO v_row;

  IF v_row.failures >= 5 THEN
    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, severity)
    VALUES (v_row.pharmacy_id, v_user, 'pin_lockout', 'security',
            'Screen unlock locked after 5 failed PIN attempts', 'high_risk');
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'failures', v_row.failures,
                            'locked_until', v_row.locked_until);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_staff_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_staff_pin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_target uuid;
BEGIN
  IF NOT public.is_pharmacy_admin() OR v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'Only shop owners can reset a PIN' USING ERRCODE = '42501';
  END IF;
  SELECT pharmacy_id INTO v_target FROM public.profiles WHERE id = _user_id;
  IF v_target IS DISTINCT FROM v_pharmacy THEN
    RAISE EXCEPTION 'Staff member not found in your pharmacy' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.staff_pins WHERE user_id = _user_id;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, auth.uid(), 'pin_reset', 'security', _user_id, 'Reset a staff member''s unlock PIN', 'audit');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reset_staff_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_staff_pin(uuid) TO authenticated;

-- ============ 9. session revoke ============
CREATE OR REPLACE FUNCTION public.revoke_staff_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_row public.staff_sessions%ROWTYPE;
BEGIN
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy linked to your account' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.staff_sessions WHERE session_id = _session_id;
  IF NOT FOUND OR v_row.pharmacy_id <> v_pharmacy THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_pharmacy_admin() AND v_row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only shop owners can sign out other devices' USING ERRCODE = '42501';
  END IF;

  UPDATE public.staff_sessions
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE session_id = _session_id;

  UPDATE public.staff_shifts
     SET ended_at = now()
   WHERE session_id = _session_id AND ended_at IS NULL;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, auth.uid(), 'session_revoked', 'staff_session', v_row.id,
          'Signed out a device remotely', 'audit');
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_staff_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_staff_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_my_session_revoked(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_sessions
    WHERE session_id = _session_id AND user_id = auth.uid() AND revoked_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_my_session_revoked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_session_revoked(uuid) TO authenticated;

-- ============ 10. activity KPIs ============
CREATE OR REPLACE FUNCTION public.get_staff_activity_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    AND last_heartbeat_at > now() - interval '3 minutes';

  SELECT COALESCE(AVG(active_seconds), 0), COALESCE(SUM(idle_seconds), 0)
    INTO v_avg, v_idle
  FROM public.staff_shifts
  WHERE pharmacy_id = v_pharmacy AND started_at >= date_trunc('day', now());

  SELECT count(*) INTO v_risk
  FROM public.staff_activity_logs
  WHERE pharmacy_id = v_pharmacy AND severity = 'high_risk'
    AND created_at >= date_trunc('day', now());

  RETURN jsonb_build_object(
    'active_now', COALESCE(v_active, 0),
    'avg_shift_seconds', ROUND(COALESCE(v_avg, 0)),
    'idle_seconds_today', COALESCE(v_idle, 0),
    'high_risk_today', COALESCE(v_risk, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_staff_activity_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_activity_kpis() TO authenticated;

-- ============ 11. risk-aware logging ============
CREATE OR REPLACE FUNCTION public.log_sale_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pharmacy uuid;
  v_amount numeric;
  v_action text;
  v_entity_id uuid;
  v_severity text := 'info';
  v_discount numeric := 0;
  v_default numeric := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
    v_action := 'sale_create';
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.total; v_entity_id := NEW.id;
    v_discount := COALESCE(NEW.discount_percent, 0);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      v_action := 'sale_create';
    ELSIF NEW.status = 'completed' AND OLD.status = 'completed' THEN
      v_action := 'sale_update';
      v_severity := 'audit';
    ELSIF NEW.status <> 'completed' AND OLD.status = 'completed' THEN
      v_action := 'sale_void';
      v_severity := 'high_risk';
    ELSE
      RETURN NEW;
    END IF;
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.total; v_entity_id := NEW.id;
    v_discount := COALESCE(NEW.discount_percent, 0);
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.status <> 'completed' THEN RETURN OLD; END IF;
    v_action := 'sale_delete';
    v_severity := 'high_risk';
    v_pharmacy := OLD.pharmacy_id; v_amount := OLD.total; v_entity_id := OLD.id;
  END IF;

  IF v_severity = 'info' AND v_discount > 0 THEN
    SELECT COALESCE(default_discount, 0) INTO v_default FROM public.pharmacies WHERE id = v_pharmacy;
    IF v_discount > v_default THEN
      v_severity := 'audit';
    END IF;
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, severity)
  VALUES (
    v_pharmacy, v_actor, v_action, 'sale', v_entity_id,
    CASE v_action
      WHEN 'sale_create' THEN 'Recorded sale of ৳' || v_amount::text
      WHEN 'sale_update' THEN 'Edited sale (now ৳' || v_amount::text || ')'
      WHEN 'sale_void'   THEN 'Voided a completed sale of ৳' || v_amount::text
      WHEN 'sale_delete' THEN 'Deleted sale of ৳' || v_amount::text
    END
    || CASE WHEN v_severity = 'audit' AND v_action = 'sale_create'
            THEN ' · discount ' || v_discount::text || '% above shop default' ELSE '' END,
    v_amount, v_severity
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_cash_transaction_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_pharmacy uuid;
  v_amount numeric;
  v_entity_id uuid;
  v_dir text; v_cat text; v_party text;
  v_severity text := 'info';
BEGIN
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;
    v_action := 'transaction_create';
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.amount; v_entity_id := NEW.id;
    v_dir := NEW.direction; v_cat := NEW.category; v_party := NEW.party_name;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;
    v_action := 'transaction_update';
    v_severity := 'audit';
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.amount; v_entity_id := NEW.id;
    v_dir := NEW.direction; v_cat := NEW.category; v_party := NEW.party_name;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.sale_id IS NOT NULL THEN RETURN OLD; END IF;
    v_action := 'transaction_delete';
    v_severity := 'high_risk';
    v_pharmacy := OLD.pharmacy_id; v_amount := OLD.amount; v_entity_id := OLD.id;
    v_dir := OLD.direction; v_cat := OLD.category; v_party := OLD.party_name;
  END IF;

  IF v_dir = 'out' AND v_severity = 'info' AND COALESCE(v_amount, 0) >= 5000 THEN
    v_severity := 'high_risk';
  ELSIF v_dir = 'out' AND v_severity = 'info' THEN
    v_severity := 'audit';
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, metadata, severity)
  VALUES (
    v_pharmacy, v_actor, v_action, 'cash_transaction', v_entity_id,
    (CASE v_action
      WHEN 'transaction_create' THEN 'Logged '
      WHEN 'transaction_update' THEN 'Edited '
      WHEN 'transaction_delete' THEN 'Deleted '
    END) || COALESCE(v_dir,'') || ' (' || COALESCE(v_cat,'') || ')'
      || CASE WHEN v_party IS NOT NULL AND v_party <> '' THEN ' — ' || v_party ELSE '' END
      || ' ৳' || v_amount::text,
    v_amount,
    jsonb_build_object('direction', v_dir, 'category', v_cat, 'party_name', v_party),
    v_severity
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_medicine_delete_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN OLD; END IF;
  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, metadata, severity)
  VALUES (
    OLD.pharmacy_id, auth.uid(), 'inventory_delete', 'medicine', OLD.id,
    'Deleted product "' || COALESCE(OLD.name, 'Unnamed') || '"'
      || CASE WHEN COALESCE(OLD.stock_quantity, 0) > 0
              THEN ' with ' || OLD.stock_quantity::text || ' in stock' ELSE '' END,
    jsonb_build_object('name', OLD.name, 'company', OLD.company_name, 'stock', OLD.stock_quantity),
    'high_risk'
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_log_medicine_delete ON public.medicines;
CREATE TRIGGER tg_log_medicine_delete
  AFTER DELETE ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.log_medicine_delete_activity();

-- ============ 12. cron for stale shifts ============
SELECT cron.unschedule('close-stale-shifts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-stale-shifts');
SELECT cron.schedule('close-stale-shifts', '*/15 * * * *', $$SELECT public.close_stale_shifts();$$);