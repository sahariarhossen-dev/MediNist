-- 1. customers table
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  total_due numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_pharmacy_name ON public.customers(pharmacy_id, name);
CREATE INDEX idx_customers_pharmacy_phone ON public.customers(pharmacy_id, phone);
CREATE UNIQUE INDEX uq_customers_pharmacy_phone ON public.customers(pharmacy_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy customers"
  ON public.customers FOR SELECT TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Members can create customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Members can update customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id())
  WITH CHECK (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Admins can delete customers"
  ON public.customers FOR DELETE TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin());

CREATE TRIGGER trg_customers_touch_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. customer_ledger table
CREATE TABLE public.customer_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('due','payment')),
  amount numeric NOT NULL CHECK (amount >= 0),
  description text,
  sale_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_ledger_customer ON public.customer_ledger(customer_id, occurred_at DESC);
CREATE INDEX idx_customer_ledger_pharmacy_date ON public.customer_ledger(pharmacy_id, occurred_at DESC);

ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy ledger"
  ON public.customer_ledger FOR SELECT TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Members can create ledger entries"
  ON public.customer_ledger FOR INSERT TO authenticated
  WITH CHECK (pharmacy_id = get_user_pharmacy_id() AND user_id = auth.uid());

CREATE POLICY "Creator or admin can update ledger"
  ON public.customer_ledger FOR UPDATE TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id() AND (user_id = auth.uid() OR is_pharmacy_admin()));

CREATE POLICY "Admins can delete ledger entries"
  ON public.customer_ledger FOR DELETE TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin());

-- 3. customer_prescriptions table
CREATE TABLE public.customer_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL,
  medicine_id uuid,
  medicine_name text NOT NULL,
  strength text,
  dosage_frequency text NOT NULL,
  dosage_timing text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_prescriptions_customer ON public.customer_prescriptions(customer_id);

ALTER TABLE public.customer_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy prescriptions"
  ON public.customer_prescriptions FOR SELECT TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Members can create prescriptions"
  ON public.customer_prescriptions FOR INSERT TO authenticated
  WITH CHECK (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Members can update prescriptions"
  ON public.customer_prescriptions FOR UPDATE TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id())
  WITH CHECK (pharmacy_id = get_user_pharmacy_id());

CREATE POLICY "Admins can delete prescriptions"
  ON public.customer_prescriptions FOR DELETE TO authenticated
  USING (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin());

-- 4. Recalc trigger function for customers.total_due
CREATE OR REPLACE FUNCTION public.recalc_customer_total_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_customer uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_customer := OLD.customer_id;
  ELSE
    target_customer := NEW.customer_id;
  END IF;

  UPDATE public.customers c
  SET total_due = COALESCE((
    SELECT SUM(CASE WHEN entry_type = 'due' THEN amount ELSE -amount END)
    FROM public.customer_ledger
    WHERE customer_id = target_customer
  ), 0),
  updated_at = now()
  WHERE c.id = target_customer;

  -- Handle UPDATE that moved entry to a different customer
  IF (TG_OP = 'UPDATE' AND OLD.customer_id <> NEW.customer_id) THEN
    UPDATE public.customers c
    SET total_due = COALESCE((
      SELECT SUM(CASE WHEN entry_type = 'due' THEN amount ELSE -amount END)
      FROM public.customer_ledger
      WHERE customer_id = OLD.customer_id
    ), 0),
    updated_at = now()
    WHERE c.id = OLD.customer_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_customer_ledger_recalc_total
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_ledger
  FOR EACH ROW EXECUTE FUNCTION public.recalc_customer_total_due();