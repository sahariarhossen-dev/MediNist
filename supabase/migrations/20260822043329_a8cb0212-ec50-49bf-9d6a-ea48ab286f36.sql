-- ============ staff_access: suspension state ============
CREATE TABLE public.staff_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL UNIQUE,
  is_suspended boolean NOT NULL DEFAULT false,
  suspended_at timestamptz,
  suspend_reason text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_access TO authenticated;
GRANT ALL ON public.staff_access TO service_role;

ALTER TABLE public.staff_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_access_admin_all" ON public.staff_access
  FOR ALL TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "staff_access_self_select" ON public.staff_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER staff_access_touch
  BEFORE UPDATE ON public.staff_access
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_staff_access_pharmacy ON public.staff_access(pharmacy_id);

-- ============ staff_permissions: granular per-staff toggles ============
CREATE TABLE public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_permissions_admin_all" ON public.staff_permissions
  FOR ALL TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "staff_permissions_self_select" ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER staff_permissions_touch
  BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_staff_permissions_pharmacy ON public.staff_permissions(pharmacy_id);

-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.is_staff_suspended(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_suspended FROM public.staff_access WHERE user_id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.has_staff_permission(_user_id uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_explicit boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = _user_id;
  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  -- Shop owners/admins always hold every capability
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;
  IF public.is_staff_suspended(_user_id) THEN
    RETURN false;
  END IF;
  SELECT enabled INTO v_explicit
  FROM public.staff_permissions
  WHERE user_id = _user_id AND permission_key = _key;
  IF v_explicit IS NOT NULL THEN
    RETURN v_explicit;
  END IF;
  -- Defaults when no explicit row exists
  RETURN CASE _key
    WHEN 'record_sales'            THEN true
    WHEN 'edit_inventory'          THEN true
    WHEN 'view_profit'             THEN false
    WHEN 'override_discount'       THEN false
    WHEN 'record_cash_out'         THEN false
    WHEN 'close_day'               THEN false
    WHEN 'view_staff_performance'  THEN false
    ELSE false
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.is_staff_suspended(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_staff_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_suspended(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(uuid, text) TO authenticated, service_role;

-- ============ enforce suspension in sales ============
CREATE OR REPLACE FUNCTION public.complete_sale(_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
  v_sale_id uuid;
  v_draft_id uuid;
  v_sale_type text;
  v_subtotal numeric;
  v_discount_percent numeric;
  v_discount_amount numeric;
  v_total numeric;
  v_gross numeric;
  v_net numeric;
  v_items jsonb;
  v_item jsonb;
  v_qty int;
  v_med_id uuid;
  v_updated uuid;
  v_payment_method text;
  v_paid_now numeric;
  v_due_amt numeric;
  v_customer_id uuid;
  v_customer_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.is_staff_suspended(v_user) THEN
    RAISE EXCEPTION 'ACCESS_SUSPENDED: Your access has been suspended by the shop owner' USING ERRCODE = '42501';
  END IF;

  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy linked to your account' USING ERRCODE = '22023';
  END IF;

  v_draft_id        := NULLIF(_payload->>'draft_id','')::uuid;
  v_sale_type       := COALESCE(_payload->>'sale_type','retail');
  v_discount_percent:= LEAST(GREATEST(COALESCE((_payload->>'discount_percent')::numeric, 0), 0), 100);
  v_items           := _payload->'items';
  v_payment_method  := COALESCE(_payload#>>'{payment,method}','cash');
  v_paid_now        := COALESCE((_payload#>>'{payment,paid_now}')::numeric, 0);
  v_customer_id     := NULLIF(_payload#>>'{payment,customer_id}','')::uuid;
  v_customer_name   := _payload#>>'{payment,customer_name}';

  IF v_sale_type NOT IN ('retail','wholesale') THEN
    RAISE EXCEPTION 'Invalid sale_type' USING ERRCODE = '22023';
  END IF;
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one item' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method NOT IN ('cash','due','split') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method IN ('due','split') AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer required for due/split payments' USING ERRCODE = '22023';
  END IF;
  IF v_sale_type = 'wholesale' THEN
    v_discount_percent := 0;
  END IF;

  IF v_draft_id IS NOT NULL THEN
    UPDATE public.sales
       SET sale_type = v_sale_type,
           status = 'completed'
     WHERE id = v_draft_id
       AND pharmacy_id = v_pharmacy
       AND status = 'draft'
     RETURNING id INTO v_sale_id;
    IF v_sale_id IS NULL THEN
      RAISE EXCEPTION 'Draft sale not found or already completed' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.sale_items WHERE sale_id = v_sale_id;
  ELSE
    INSERT INTO public.sales (
      pharmacy_id, user_id, sale_type, subtotal,
      discount_percent, discount_amount, total, status
    ) VALUES (
      v_pharmacy, v_user, v_sale_type, 0, v_discount_percent, 0, 0, 'completed'
    ) RETURNING id INTO v_sale_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_med_id := (v_item->>'medicine_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be positive' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sale_items (
      sale_id, medicine_id, medicine_name, company_name,
      quantity, unit_price, total_price, discount_percent
    ) VALUES (
      v_sale_id,
      v_med_id,
      v_item->>'medicine_name',
      v_item->>'company_name',
      v_qty,
      0,
      0,
      CASE WHEN v_sale_type = 'wholesale'
           THEN COALESCE((v_item->>'discount_percent')::numeric, 0)
           ELSE 0 END
    );

    UPDATE public.medicines
       SET stock_quantity = stock_quantity - v_qty
     WHERE id = v_med_id
       AND pharmacy_id = v_pharmacy
       AND COALESCE(stock_quantity, 0) >= v_qty
     RETURNING id INTO v_updated;

    IF v_updated IS NULL THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_med_id USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(quantity * unit_price), 0), COALESCE(SUM(total_price), 0)
    INTO v_gross, v_net
    FROM public.sale_items
   WHERE sale_id = v_sale_id;

  v_subtotal := ROUND(v_gross, 2);
  IF v_sale_type = 'wholesale' THEN
    v_total := ROUND(v_net, 2);
  ELSE
    v_total := ROUND(v_subtotal * (1 - v_discount_percent / 100.0), 2);
  END IF;
  v_discount_amount := GREATEST(0, ROUND(v_subtotal - v_total, 2));

  UPDATE public.sales
     SET subtotal = v_subtotal,
         discount_percent = v_discount_percent,
         discount_amount = v_discount_amount,
         total = v_total
   WHERE id = v_sale_id;

  IF v_payment_method IN ('due','split') AND v_customer_id IS NOT NULL THEN
    IF v_payment_method = 'split' THEN
      v_paid_now := GREATEST(0, LEAST(v_total, v_paid_now));
    ELSE
      v_paid_now := 0;
    END IF;
    v_due_amt := GREATEST(0, v_total - v_paid_now);

    IF v_due_amt > 0 THEN
      INSERT INTO public.customer_ledger (
        customer_id, pharmacy_id, user_id, entry_type, amount, description, sale_id
      ) VALUES (
        v_customer_id, v_pharmacy, v_user, 'due', v_due_amt,
        'Sale #' || substring(v_sale_id::text from 1 for 8), v_sale_id
      );
    END IF;

    IF v_payment_method = 'split' AND v_paid_now > 0 THEN
      INSERT INTO public.cash_transactions (
        pharmacy_id, user_id, direction, category, party_name, amount, sale_id
      ) VALUES (
        v_pharmacy, v_user, 'in', 'sale_cash', v_customer_name, v_paid_now, v_sale_id
      );
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$function$;

-- ============ enforce suspension + cash-out permission on cash_transactions ============
CREATE OR REPLACE FUNCTION public.tg_cash_transactions_prevent_negative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_starting numeric := 0;
  v_sales numeric := 0;
  v_dues numeric := 0;
  v_cash_in numeric := 0;
  v_due_recv numeric := 0;
  v_payments numeric := 0;
  v_available numeric := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_staff_suspended(auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_SUSPENDED: Your access has been suspended by the shop owner' USING ERRCODE = '42501';
  END IF;

  IF NEW.direction <> 'out' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.has_staff_permission(auth.uid(), 'record_cash_out') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: You are not allowed to record payments or expenses' USING ERRCODE = '42501';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(starting_cash_balance, 0) INTO v_starting
  FROM public.pharmacy_settings
  WHERE pharmacy_id = NEW.pharmacy_id;
  v_starting := COALESCE(v_starting, 0);

  SELECT COALESCE(SUM(total), 0) INTO v_sales
  FROM public.sales
  WHERE pharmacy_id = NEW.pharmacy_id
    AND status = 'completed'
    AND created_at < NEW.occurred_at;

  SELECT COALESCE(SUM(amount), 0) INTO v_dues
  FROM public.customer_ledger
  WHERE pharmacy_id = NEW.pharmacy_id
    AND entry_type = 'due'
    AND occurred_at < NEW.occurred_at;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in'  AND category = 'other_in'        THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'in'  AND category = 'due_collection'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out'                                   THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_due_recv, v_payments
  FROM public.cash_transactions
  WHERE pharmacy_id = NEW.pharmacy_id
    AND occurred_at < NEW.occurred_at;

  v_available := v_starting + GREATEST(0, v_sales - v_dues) + v_due_recv + v_cash_in - v_payments;

  IF NEW.amount > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_CASH: Cash in Hand cannot go negative. Available: ৳%, requested: ৳%',
      round(v_available, 2), round(NEW.amount, 2)
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============ staff overview now reports suspension ============
DROP FUNCTION IF EXISTS public.get_pharmacy_staff_overview();
CREATE FUNCTION public.get_pharmacy_staff_overview()
 RETURNS TABLE(user_id uuid, full_name text, avatar_url text, phone text, role text,
               month_sales numeric, month_count integer, monthly_target numeric,
               commission_percent numeric, basic_salary numeric,
               is_suspended boolean, last_seen timestamptz)
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
    COALESCE(ss.monthly_target, 0) AS monthly_target,
    COALESCE(ss.commission_percent, 0) AS commission_percent,
    COALESCE(ss.basic_salary, 0) AS basic_salary,
    COALESCE(sa.is_suspended, false) AS is_suspended,
    p.last_seen
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
  LEFT JOIN public.staff_access sa
    ON sa.user_id = p.id
  WHERE p.pharmacy_id = ph.pid
    AND auth.uid() IS NOT NULL
    AND (public.is_pharmacy_admin_or_manager() OR p.id = auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.get_pharmacy_staff_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() TO authenticated, service_role;