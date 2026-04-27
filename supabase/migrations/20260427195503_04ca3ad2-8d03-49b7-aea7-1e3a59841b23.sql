-- 1. Extend daily_closings
ALTER TABLE public.daily_closings
  ADD COLUMN IF NOT EXISTS closed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS declared_cash numeric,
  ADD COLUMN IF NOT EXISTS system_cash numeric,
  ADD COLUMN IF NOT EXISTS discrepancy numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS closing_type text NOT NULL DEFAULT 'auto';

-- 2. admin_override_requests
CREATE TABLE IF NOT EXISTS public.admin_override_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('edit','delete')),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aor_pharmacy_status ON public.admin_override_requests (pharmacy_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aor_requested_by ON public.admin_override_requests (requested_by, created_at DESC);

ALTER TABLE public.admin_override_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can create override requests" ON public.admin_override_requests;
CREATE POLICY "Members can create override requests"
  ON public.admin_override_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND requested_by = auth.uid());

DROP POLICY IF EXISTS "Members can view their own override requests" ON public.admin_override_requests;
CREATE POLICY "Members can view their own override requests"
  ON public.admin_override_requests
  FOR SELECT
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND (requested_by = auth.uid() OR public.is_pharmacy_admin()));

DROP POLICY IF EXISTS "Admins can update override requests" ON public.admin_override_requests;
CREATE POLICY "Admins can update override requests"
  ON public.admin_override_requests
  FOR UPDATE
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

-- No DELETE policy => immutable.

-- 3. Tighten sales UPDATE: managers/salesmen can only edit drafts; admins can edit anything.
DROP POLICY IF EXISTS "Creator or admin can update sales" ON public.sales;
CREATE POLICY "Creator or admin can update sales"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND (
      public.is_pharmacy_admin()
      OR (user_id = auth.uid() AND status <> 'completed')
    )
  );

-- 4. submit_blind_closing RPC
CREATE OR REPLACE FUNCTION public.submit_blind_closing(_declared numeric, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Today's completed sales total
  SELECT COALESCE(SUM(total), 0) INTO v_total_sales
  FROM public.sales
  WHERE pharmacy_id = v_pharmacy AND status = 'completed'
    AND created_at >= v_day_start AND created_at <= v_day_end;

  -- Today's new dues (entry_type='due')
  SELECT COALESCE(SUM(amount), 0) INTO v_total_due
  FROM public.customer_ledger
  WHERE pharmacy_id = v_pharmacy AND entry_type = 'due'
    AND occurred_at >= v_day_start AND occurred_at <= v_day_end;

  -- Cash transactions today
  SELECT
    COALESCE(SUM(CASE WHEN direction='in' AND category='other_in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='in' AND category='due_collection' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction='out' THEN amount ELSE 0 END), 0)
  INTO v_cash_in_invest, v_due_received, v_payments
  FROM public.cash_transactions
  WHERE pharmacy_id = v_pharmacy
    AND occurred_at >= v_day_start AND occurred_at <= v_day_end;

  -- Starting balance: prior closing or pharmacy_settings
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

  -- Upsert manual closing
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

  -- Audit: blind_closing
  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, amount, metadata)
  VALUES (
    v_pharmacy, v_user, 'blind_closing', 'daily_closing',
    'Submitted shift cash count of ৳' || _declared::text,
    _declared,
    jsonb_build_object('system_cash', v_system_cash, 'discrepancy', v_discrepancy, 'notes', _notes)
  );

  -- Audit: closing_discrepancy if non-trivial
  IF abs(v_discrepancy) >= 1 THEN
    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, description, amount, metadata)
    VALUES (
      v_pharmacy, v_user, 'closing_discrepancy', 'daily_closing',
      CASE WHEN v_discrepancy > 0
        THEN 'Cash surplus of ৳' || v_discrepancy::text || ' detected at shift close'
        ELSE 'Cash shortage of ৳' || (abs(v_discrepancy))::text || ' detected at shift close'
      END,
      v_discrepancy,
      jsonb_build_object('declared', _declared, 'system_cash', v_system_cash)
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_blind_closing(numeric, text) TO authenticated;