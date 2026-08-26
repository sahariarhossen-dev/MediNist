-- Keep the inventory-log sale lookup fast
CREATE INDEX IF NOT EXISTS idx_sale_items_medicine_created
  ON public.sale_items (medicine_id, created_at DESC);

-- 1. PIN verification: log every failure + lockout
CREATE OR REPLACE FUNCTION public.verify_staff_pin(_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, metadata, severity)
  VALUES (v_row.pharmacy_id, v_user, 'pin_failed', 'security',
          'Failed screen unlock attempt (' || v_row.failures::text || ' of 5)',
          jsonb_build_object('failures', v_row.failures), 'security');

  IF v_row.failures >= 5 THEN
    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, severity)
    VALUES (v_row.pharmacy_id, v_user, 'pin_locked', 'security',
            'Screen unlock locked after 5 failed PIN attempts', 'high_risk');
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'failures', v_row.failures,
                            'locked_until', v_row.locked_until);
END;
$function$;

-- 2. PIN set / reset / session revoke -> security severity
CREATE OR REPLACE FUNCTION public.set_staff_pin(_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, v_user, 'pin_set', 'security', v_user, 'Set or changed their unlock PIN', 'security');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_staff_pin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  VALUES (v_pharmacy, auth.uid(), 'pin_reset', 'security', _user_id, 'Reset a staff member''s unlock PIN', 'security');
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_staff_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, metadata, severity)
  VALUES (v_pharmacy, auth.uid(), 'session_revoked', 'staff_session', v_row.id,
          'Signed out a device remotely',
          jsonb_build_object('device_type', v_row.device_type, 'browser', v_row.browser, 'os', v_row.os),
          'security');
END;
$function$;

-- 3. Read-only refusal + blocked IP loggers (own transaction, called from client / edge fn)
CREATE OR REPLACE FUNCTION public.log_read_only_block(_entity text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
  v_recent int;
BEGIN
  IF v_user IS NULL OR NOT public.is_staff_read_only(v_user) THEN
    RETURN;
  END IF;
  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN RETURN; END IF;

  -- throttle: at most one row per minute per member
  SELECT count(*) INTO v_recent
    FROM public.staff_activity_logs
   WHERE user_id = v_user AND action_type = 'read_only_block'
     AND created_at > now() - interval '1 minute';
  IF v_recent > 0 THEN RETURN; END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, metadata, severity)
  VALUES (v_pharmacy, v_user, 'read_only_block', 'security',
          'Blocked action attempt while under remote lock'
            || CASE WHEN _entity IS NOT NULL AND _entity <> '' THEN ' (' || _entity || ')' ELSE '' END,
          jsonb_build_object('entity', _entity), 'high_risk');
END;
$function$;

REVOKE ALL ON FUNCTION public.log_read_only_block(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_read_only_block(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_blocked_ip_attempt(_user_id uuid, _pharmacy_id uuid, _ip_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recent int;
BEGIN
  SELECT count(*) INTO v_recent
    FROM public.staff_activity_logs
   WHERE user_id = _user_id AND action_type = 'blocked_ip_attempt'
     AND created_at > now() - interval '5 minutes';
  IF v_recent > 0 THEN RETURN; END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, metadata, severity)
  VALUES (_pharmacy_id, _user_id, 'blocked_ip_attempt', 'security',
          'Sign-in attempt from a network outside the allowed list',
          jsonb_build_object('ip_hash', _ip_hash), 'high_risk');
END;
$function$;

REVOKE ALL ON FUNCTION public.log_blocked_ip_attempt(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_blocked_ip_attempt(uuid, uuid, text) TO service_role;

-- 4. Day close: severity-graded discrepancy log
CREATE OR REPLACE FUNCTION public.submit_blind_closing(_declared numeric, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_day_start timestamptz := date_trunc('day', now());
  v_day_end timestamptz := date_trunc('day', now()) + interval '1 day' - interval '1 microsecond';
  v_total_sales numeric := 0;
  v_total_due numeric := 0;
  v_cash_in_invest numeric := 0;
  v_due_received numeric := 0;
  v_payments numeric := 0;
  v_starting numeric := 0;
  v_system_cash numeric := 0;
  v_discrepancy numeric := 0;
  v_limit numeric;
  v_severity text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _declared IS NULL OR _declared < 0 OR _declared > 10000000 THEN
    RAISE EXCEPTION 'Invalid declared cash amount' USING ERRCODE = '22023';
  END IF;

  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy associated with user' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_total_sales
  FROM public.sales
  WHERE pharmacy_id = v_pharmacy AND status = 'completed'
    AND created_at >= v_day_start AND created_at <= v_day_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_due
  FROM public.customer_ledger
  WHERE pharmacy_id = v_pharmacy AND entry_type = 'due'
    AND occurred_at >= v_day_start AND occurred_at <= v_day_end;

  SELECT
    COALESCE(SUM(CASE WHEN direction='in' AND category='other_in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='in' AND category='due_collection' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='out' THEN amount ELSE 0 END), 0)
  INTO v_cash_in_invest, v_due_received, v_payments
  FROM public.cash_transactions
  WHERE pharmacy_id = v_pharmacy
    AND occurred_at >= v_day_start AND occurred_at <= v_day_end;

  SELECT net_balance INTO v_starting
  FROM public.daily_closings
  WHERE pharmacy_id = v_pharmacy AND closing_date < v_today
  ORDER BY closing_date DESC LIMIT 1;
  IF v_starting IS NULL THEN
    SELECT COALESCE(starting_cash_balance, 0) INTO v_starting
    FROM public.pharmacy_settings WHERE pharmacy_id = v_pharmacy;
    v_starting := COALESCE(v_starting, 0);
  END IF;

  v_system_cash := v_starting + GREATEST(0, v_total_sales - v_total_due) + v_due_received + v_cash_in_invest - v_payments;
  v_discrepancy := _declared - v_system_cash;

  INSERT INTO public.daily_closings (
    pharmacy_id, closing_date, starting_balance, total_sales, total_cash_in,
    total_payments, total_due, net_balance, closed_at,
    closed_by_user_id, declared_cash, system_cash, discrepancy, notes, closing_type
  ) VALUES (
    v_pharmacy, v_today, v_starting, v_total_sales,
    v_cash_in_invest + v_due_received, v_payments, v_total_due,
    v_system_cash, now(),
    v_user, _declared, v_system_cash, v_discrepancy, _notes, 'manual'
  )
  ON CONFLICT (pharmacy_id, closing_date) DO UPDATE SET
    starting_balance = EXCLUDED.starting_balance,
    total_sales = EXCLUDED.total_sales,
    total_cash_in = EXCLUDED.total_cash_in,
    total_payments = EXCLUDED.total_payments,
    total_due = EXCLUDED.total_due,
    net_balance = EXCLUDED.net_balance,
    closed_at = EXCLUDED.closed_at,
    closed_by_user_id = EXCLUDED.closed_by_user_id,
    declared_cash = EXCLUDED.declared_cash,
    system_cash = EXCLUDED.system_cash,
    discrepancy = EXCLUDED.discrepancy,
    notes = EXCLUDED.notes,
    closing_type = 'manual';

  SELECT COALESCE(closing_discrepancy_limit, 500) INTO v_limit
    FROM public.pharmacy_settings WHERE pharmacy_id = v_pharmacy;
  v_limit := COALESCE(v_limit, 500);

  v_severity := CASE
    WHEN abs(v_discrepancy) <= 50 THEN 'info'
    WHEN v_discrepancy < 0 AND abs(v_discrepancy) > v_limit THEN 'high_risk'
    ELSE 'audit'
  END;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, amount, metadata, severity)
  VALUES (
    v_pharmacy, v_user, 'day_closed', 'daily_closing',
    'Day closed · counted ৳' || _declared::text || ' vs system ৳' || v_system_cash::text
      || CASE
           WHEN abs(v_discrepancy) <= 50 THEN ' (balanced)'
           WHEN v_discrepancy > 0 THEN ' · surplus ৳' || v_discrepancy::text
           ELSE ' · shortfall ৳' || abs(v_discrepancy)::text
         END,
    v_discrepancy,
    jsonb_build_object(
      'notes', _notes,
      'changes', jsonb_build_array(
        jsonb_build_object('field', 'System cash', 'old', '৳' || v_system_cash::text, 'new', '৳' || _declared::text),
        jsonb_build_object('field', 'Discrepancy', 'old', '৳0', 'new', '৳' || v_discrepancy::text)
      )
    ),
    v_severity
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 5. Settings, discount policy, permission and suspension audit
CREATE OR REPLACE FUNCTION public.log_pharmacy_settings_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  IF OLD.max_discount_percent IS DISTINCT FROM NEW.max_discount_percent THEN
    v_changes := v_changes || jsonb_build_object('field', 'Max discount %', 'old', OLD.max_discount_percent::text, 'new', NEW.max_discount_percent::text);
  END IF;
  IF OLD.require_discount_approval IS DISTINCT FROM NEW.require_discount_approval THEN
    v_changes := v_changes || jsonb_build_object('field', 'Discount approval', 'old', OLD.require_discount_approval::text, 'new', NEW.require_discount_approval::text);
  END IF;
  IF OLD.starting_cash_balance IS DISTINCT FROM NEW.starting_cash_balance THEN
    v_changes := v_changes || jsonb_build_object('field', 'Opening cash', 'old', '৳' || OLD.starting_cash_balance::text, 'new', '৳' || NEW.starting_cash_balance::text);
  END IF;
  IF OLD.large_cash_out_threshold IS DISTINCT FROM NEW.large_cash_out_threshold THEN
    v_changes := v_changes || jsonb_build_object('field', 'Large cash-out alert', 'old', '৳' || OLD.large_cash_out_threshold::text, 'new', '৳' || NEW.large_cash_out_threshold::text);
  END IF;
  IF OLD.closing_discrepancy_limit IS DISTINCT FROM NEW.closing_discrepancy_limit THEN
    v_changes := v_changes || jsonb_build_object('field', 'Closing discrepancy limit', 'old', '৳' || OLD.closing_discrepancy_limit::text, 'new', '৳' || NEW.closing_discrepancy_limit::text);
  END IF;
  IF OLD.price_drop_alert_percent IS DISTINCT FROM NEW.price_drop_alert_percent THEN
    v_changes := v_changes || jsonb_build_object('field', 'Price drop alert %', 'old', OLD.price_drop_alert_percent::text, 'new', NEW.price_drop_alert_percent::text);
  END IF;

  IF jsonb_array_length(v_changes) = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, metadata, severity)
  VALUES (NEW.pharmacy_id, v_actor, 'settings_changed', 'pharmacy_settings',
          'Updated shop control settings', jsonb_build_object('changes', v_changes), 'audit');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_log_pharmacy_settings ON public.pharmacy_settings;
CREATE TRIGGER tg_log_pharmacy_settings
AFTER UPDATE ON public.pharmacy_settings
FOR EACH ROW EXECUTE FUNCTION public.log_pharmacy_settings_activity();

CREATE OR REPLACE FUNCTION public.log_pharmacy_discount_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  IF OLD.default_discount IS NOT DISTINCT FROM NEW.default_discount THEN RETURN NEW; END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, metadata, severity)
  VALUES (NEW.id, v_actor, 'discount_policy_changed', 'pharmacy',
          'Default discount changed from ' || COALESCE(OLD.default_discount, 0)::text || '% to ' || COALESCE(NEW.default_discount, 0)::text || '%',
          jsonb_build_object('changes', jsonb_build_array(
            jsonb_build_object('field', 'Default discount', 'old', COALESCE(OLD.default_discount, 0)::text || '%', 'new', COALESCE(NEW.default_discount, 0)::text || '%')
          )), 'audit');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_log_pharmacy_discount ON public.pharmacies;
CREATE TRIGGER tg_log_pharmacy_discount
AFTER UPDATE ON public.pharmacies
FOR EACH ROW EXECUTE FUNCTION public.log_pharmacy_discount_activity();

CREATE OR REPLACE FUNCTION public.log_staff_permission_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_old text; v_new text;
  v_pharmacy uuid;
  v_target uuid;
  v_key text;
BEGIN
  IF v_actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    v_old := 'off'; v_new := CASE WHEN NEW.enabled THEN 'on' ELSE 'off' END;
    v_pharmacy := NEW.pharmacy_id; v_target := NEW.user_id; v_key := NEW.permission_key;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.enabled IS NOT DISTINCT FROM NEW.enabled THEN RETURN NEW; END IF;
    v_old := CASE WHEN OLD.enabled THEN 'on' ELSE 'off' END;
    v_new := CASE WHEN NEW.enabled THEN 'on' ELSE 'off' END;
    v_pharmacy := NEW.pharmacy_id; v_target := NEW.user_id; v_key := NEW.permission_key;
  ELSE
    v_old := CASE WHEN OLD.enabled THEN 'on' ELSE 'off' END; v_new := 'removed';
    v_pharmacy := OLD.pharmacy_id; v_target := OLD.user_id; v_key := OLD.permission_key;
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, metadata, severity)
  VALUES (v_pharmacy, v_actor, 'permission_changed', 'staff', v_target,
          'Permission "' || replace(v_key, '_', ' ') || '" set to ' || v_new,
          jsonb_build_object('permission_key', v_key, 'target_user', v_target,
            'changes', jsonb_build_array(jsonb_build_object('field', replace(v_key, '_', ' '), 'old', v_old, 'new', v_new))),
          'audit');
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_log_staff_permission ON public.staff_permissions;
CREATE TRIGGER tg_log_staff_permission
AFTER INSERT OR UPDATE OR DELETE ON public.staff_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_staff_permission_activity();

CREATE OR REPLACE FUNCTION public.log_staff_access_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_suspended IS NOT DISTINCT FROM NEW.is_suspended THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NOT NEW.is_suspended THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, metadata, severity)
  VALUES (NEW.pharmacy_id, NEW.user_id,
          CASE WHEN NEW.is_suspended THEN 'staff_suspended' ELSE 'staff_unsuspended' END,
          'staff', NEW.user_id,
          CASE WHEN NEW.is_suspended
               THEN 'Access suspended by the shop owner' || COALESCE(' — ' || NEW.suspend_reason, '')
               ELSE 'Access restored by the shop owner' END,
          jsonb_build_object('changes', jsonb_build_array(
            jsonb_build_object('field', 'Suspended', 'old', CASE WHEN TG_OP = 'INSERT' THEN 'no' ELSE CASE WHEN OLD.is_suspended THEN 'yes' ELSE 'no' END END,
                               'new', CASE WHEN NEW.is_suspended THEN 'yes' ELSE 'no' END))),
          'audit');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_log_staff_access ON public.staff_access;
CREATE TRIGGER tg_log_staff_access
AFTER INSERT OR UPDATE ON public.staff_access
FOR EACH ROW EXECUTE FUNCTION public.log_staff_access_activity();

-- 6. Report function for the duty + audit export
CREATE OR REPLACE FUNCTION public.get_audit_report(_user_id uuid DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_me uuid := auth.uid();
  v_target uuid := _user_id;
  v_from timestamptz := COALESCE(_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(_to, now());
  v_invoices int := 0; v_amount numeric := 0; v_secs numeric := 0;
  v_logs jsonb := '[]'::jsonb;
  v_flags int := 0;
BEGIN
  IF v_pharmacy IS NULL OR v_me IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF NOT public.is_pharmacy_admin_or_manager() THEN v_target := v_me; END IF;

  SELECT count(*), COALESCE(SUM(total), 0) INTO v_invoices, v_amount
    FROM public.sales
   WHERE pharmacy_id = v_pharmacy AND status = 'completed'
     AND created_at BETWEEN v_from AND v_to
     AND (v_target IS NULL OR user_id = v_target);

  SELECT COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)), 43200)), 0)
    INTO v_secs
    FROM public.staff_shifts
   WHERE pharmacy_id = v_pharmacy AND started_at BETWEEN v_from AND v_to
     AND (v_target IS NULL OR user_id = v_target);

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb), count(*) FILTER (WHERE x->>'severity' = 'high_risk')
    INTO v_logs, v_flags
    FROM (
      SELECT jsonb_build_object(
               'created_at', l.created_at,
               'staff_name', COALESCE(p.full_name, 'Member'),
               'action_type', l.action_type,
               'severity', l.severity,
               'description', l.description,
               'amount', l.amount
             ) AS x
        FROM public.staff_activity_logs l
        LEFT JOIN public.profiles p ON p.id = l.user_id
       WHERE l.pharmacy_id = v_pharmacy
         AND l.created_at BETWEEN v_from AND v_to
         AND l.severity <> 'info'
         AND (v_target IS NULL OR l.user_id = v_target)
       ORDER BY l.created_at DESC
       LIMIT 2000
    ) s;

  RETURN jsonb_build_object(
    'from', v_from, 'to', v_to,
    'invoices', v_invoices,
    'sales_amount', ROUND(COALESCE(v_amount, 0), 2),
    'duty_seconds', ROUND(COALESCE(v_secs, 0)),
    'red_flags', COALESCE(v_flags, 0),
    'logs', COALESCE(v_logs, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_audit_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_report(uuid, timestamptz, timestamptz) TO authenticated;