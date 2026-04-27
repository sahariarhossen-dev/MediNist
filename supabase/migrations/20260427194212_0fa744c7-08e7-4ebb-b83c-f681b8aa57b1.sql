-- 1. Add last_seen to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- 2. Heartbeat RPC
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.bypass_profile_guards', 'on', true);
  UPDATE public.profiles SET last_seen = now() WHERE id = auth.uid();
  PERFORM set_config('app.bypass_profile_guards', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- 3. Audit log table
CREATE TABLE IF NOT EXISTS public.staff_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  description text,
  amount numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_pharmacy_created ON public.staff_activity_logs (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_user_created ON public.staff_activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_action ON public.staff_activity_logs (action_type);

ALTER TABLE public.staff_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view pharmacy activity logs" ON public.staff_activity_logs;
CREATE POLICY "Admins can view pharmacy activity logs"
  ON public.staff_activity_logs
  FOR SELECT
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

DROP POLICY IF EXISTS "Members can insert their own activity logs" ON public.staff_activity_logs;
CREATE POLICY "Members can insert their own activity logs"
  ON public.staff_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND user_id = auth.uid());

-- No UPDATE / DELETE policies => immutable.

-- 4. Trigger: sales
CREATE OR REPLACE FUNCTION public.log_sale_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pharmacy uuid;
  v_amount numeric;
  v_action text;
  v_entity_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
    v_action := 'sale_create';
    v_pharmacy := NEW.pharmacy_id;
    v_amount := NEW.total;
    v_entity_id := NEW.id;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Log when a sale transitions to completed, or is edited while completed
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      v_action := 'sale_create';
    ELSIF NEW.status = 'completed' AND OLD.status = 'completed' THEN
      v_action := 'sale_update';
    ELSE
      RETURN NEW;
    END IF;
    v_pharmacy := NEW.pharmacy_id;
    v_amount := NEW.total;
    v_entity_id := NEW.id;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.status <> 'completed' THEN RETURN OLD; END IF;
    v_action := 'sale_delete';
    v_pharmacy := OLD.pharmacy_id;
    v_amount := OLD.total;
    v_entity_id := OLD.id;
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount)
  VALUES (
    v_pharmacy,
    v_actor,
    v_action,
    'sale',
    v_entity_id,
    CASE v_action
      WHEN 'sale_create' THEN 'Recorded sale of ৳' || v_amount::text
      WHEN 'sale_update' THEN 'Edited sale (now ৳' || v_amount::text || ')'
      WHEN 'sale_delete' THEN 'Deleted sale of ৳' || v_amount::text
    END,
    v_amount
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_sale_activity ON public.sales;
CREATE TRIGGER trg_log_sale_activity
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.log_sale_activity();

-- 5. Trigger: cash_transactions
CREATE OR REPLACE FUNCTION public.log_cash_transaction_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_pharmacy uuid;
  v_amount numeric;
  v_entity_id uuid;
  v_dir text;
  v_cat text;
  v_party text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    -- Skip auto-generated sale entries (those have a sale_id) to avoid double-logging
    IF NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;
    v_action := 'transaction_create';
    v_pharmacy := NEW.pharmacy_id;
    v_amount := NEW.amount;
    v_entity_id := NEW.id;
    v_dir := NEW.direction; v_cat := NEW.category; v_party := NEW.party_name;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;
    v_action := 'transaction_update';
    v_pharmacy := NEW.pharmacy_id;
    v_amount := NEW.amount;
    v_entity_id := NEW.id;
    v_dir := NEW.direction; v_cat := NEW.category; v_party := NEW.party_name;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.sale_id IS NOT NULL THEN RETURN OLD; END IF;
    v_action := 'transaction_delete';
    v_pharmacy := OLD.pharmacy_id;
    v_amount := OLD.amount;
    v_entity_id := OLD.id;
    v_dir := OLD.direction; v_cat := OLD.category; v_party := OLD.party_name;
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, metadata)
  VALUES (
    v_pharmacy,
    v_actor,
    v_action,
    'cash_transaction',
    v_entity_id,
    (CASE v_action
      WHEN 'transaction_create' THEN 'Logged '
      WHEN 'transaction_update' THEN 'Edited '
      WHEN 'transaction_delete' THEN 'Deleted '
    END) || COALESCE(v_dir,'') || ' (' || COALESCE(v_cat,'') || ')'
      || CASE WHEN v_party IS NOT NULL AND v_party <> '' THEN ' — ' || v_party ELSE '' END
      || ' ৳' || v_amount::text,
    v_amount,
    jsonb_build_object('direction', v_dir, 'category', v_cat, 'party_name', v_party)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_cash_transaction_activity ON public.cash_transactions;
CREATE TRIGGER trg_log_cash_transaction_activity
AFTER INSERT OR UPDATE OR DELETE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.log_cash_transaction_activity();

-- 6. Trigger: customer_ledger payments
CREATE OR REPLACE FUNCTION public.log_customer_ledger_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  IF NEW.entry_type <> 'payment' THEN RETURN NEW; END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount)
  VALUES (
    NEW.pharmacy_id,
    v_actor,
    'payment_received',
    'customer_ledger',
    NEW.id,
    'Received customer payment of ৳' || NEW.amount::text,
    NEW.amount
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_customer_ledger_activity ON public.customer_ledger;
CREATE TRIGGER trg_log_customer_ledger_activity
AFTER INSERT ON public.customer_ledger
FOR EACH ROW EXECUTE FUNCTION public.log_customer_ledger_activity();