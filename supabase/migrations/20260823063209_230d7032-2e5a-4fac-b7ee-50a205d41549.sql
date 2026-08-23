-- ============ Migration C: read-only enforcement + duty metrics ============

-- 1. Generic read-only guard trigger
CREATE OR REPLACE FUNCTION public.tg_block_read_only_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_staff_read_only(auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_READ_ONLY: App blocked by shop owner' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS block_read_only_medicines ON public.medicines;
CREATE TRIGGER block_read_only_medicines
  BEFORE INSERT OR UPDATE OR DELETE ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_read_only_staff();

DROP TRIGGER IF EXISTS block_read_only_cash ON public.cash_transactions;
CREATE TRIGGER block_read_only_cash
  BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_read_only_staff();

DROP TRIGGER IF EXISTS block_read_only_ledger ON public.customer_ledger;
CREATE TRIGGER block_read_only_ledger
  BEFORE INSERT OR UPDATE OR DELETE ON public.customer_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_read_only_staff();

DROP TRIGGER IF EXISTS block_read_only_customers ON public.customers;
CREATE TRIGGER block_read_only_customers
  BEFORE INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_read_only_staff();

-- 2. Duty summary for the Activity tab
CREATE OR REPLACE FUNCTION public.get_staff_duty_summary(_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_me uuid := auth.uid();
  v_target uuid := _user_id;
  v_day_start timestamptz := date_trunc('day', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka';
  v_month_start timestamptz := date_trunc('month', (now() AT TIME ZONE 'Asia/Dhaka')) AT TIME ZONE 'Asia/Dhaka';
  v_inv_today int := 0; v_amt_today numeric := 0;
  v_inv_month int := 0; v_amt_month numeric := 0;
  v_secs_today numeric := 0; v_secs_month numeric := 0;
  v_pending_del int := 0; v_pending_disc int := 0;
  v_read_only boolean := false;
  v_shift_id uuid; v_shift_started timestamptz;
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

  SELECT COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)), 43200)), 0)
    INTO v_secs_today
    FROM public.staff_shifts
   WHERE pharmacy_id = v_pharmacy AND started_at >= v_day_start
     AND (v_target IS NULL OR user_id = v_target);

  SELECT COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)), 43200)), 0)
    INTO v_secs_month
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
    SELECT id, started_at INTO v_shift_id, v_shift_started
      FROM public.staff_shifts
     WHERE pharmacy_id = v_pharmacy AND user_id = v_target AND ended_at IS NULL
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'invoices_today', v_inv_today,
    'sales_amount_today', ROUND(COALESCE(v_amt_today, 0), 2),
    'invoices_month', v_inv_month,
    'sales_amount_month', ROUND(COALESCE(v_amt_month, 0), 2),
    'duty_seconds_today', ROUND(COALESCE(v_secs_today, 0)),
    'duty_seconds_month', ROUND(COALESCE(v_secs_month, 0)),
    'pending_deletions', COALESCE(v_pending_del, 0),
    'pending_discounts', COALESCE(v_pending_disc, 0),
    'is_read_only', COALESCE(v_read_only, false),
    'shift_open', v_shift_id IS NOT NULL,
    'shift_started_at', v_shift_started
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_duty_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_duty_summary(uuid) TO authenticated;

-- 3. Pending approvals queue with entity detail
CREATE OR REPLACE FUNCTION public.get_pending_approvals(_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, entity_type text, entity_id uuid, action text, reason text,
  requested_by uuid, requester_name text, created_at timestamptz,
  title text, amount numeric, discount_percent numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id, r.entity_type, r.entity_id, r.action, r.reason,
         r.requested_by, p.full_name AS requester_name, r.created_at,
         COALESCE(m.name, 'Invoice #' || substring(r.entity_id::text from 1 for 8)) AS title,
         s.total AS amount,
         s.discount_percent
    FROM public.admin_override_requests r
    LEFT JOIN public.profiles p ON p.id = r.requested_by
    LEFT JOIN public.medicines m ON m.id = r.entity_id AND r.entity_type = 'medicine'
    LEFT JOIN public.sales s ON s.id = r.entity_id AND r.entity_type = 'sale'
   WHERE r.pharmacy_id = public.get_user_pharmacy_id()
     AND public.is_pharmacy_admin()
     AND r.status = 'pending'
     AND (_user_id IS NULL OR r.requested_by = _user_id)
   ORDER BY r.created_at DESC
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_pending_approvals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_approvals(uuid) TO authenticated;