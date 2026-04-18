-- 1. cash_transactions: unified ledger of cash movements
CREATE TABLE public.cash_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID NOT NULL,
  user_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  category TEXT NOT NULL CHECK (category IN ('sale_cash','due_collection','supplier_payment','expense','other_in','other_out')),
  party_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  sale_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_tx_pharmacy_date ON public.cash_transactions(pharmacy_id, occurred_at DESC);

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy cash transactions"
ON public.cash_transactions FOR SELECT TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Members can create cash transactions"
ON public.cash_transactions FOR INSERT TO authenticated
WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND user_id = auth.uid());

CREATE POLICY "Creator or admin can update cash transactions"
ON public.cash_transactions FOR UPDATE TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND (user_id = auth.uid() OR public.is_pharmacy_admin()));

CREATE POLICY "Admins can delete cash transactions"
ON public.cash_transactions FOR DELETE TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

-- 2. customer_dues: open dues from credit sales
CREATE TABLE public.customer_dues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID NOT NULL,
  sale_id UUID,
  customer_name TEXT,
  amount_due NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_dues_pharmacy_date ON public.customer_dues(pharmacy_id, created_at DESC);

ALTER TABLE public.customer_dues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy dues"
ON public.customer_dues FOR SELECT TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Members can create dues"
ON public.customer_dues FOR INSERT TO authenticated
WITH CHECK (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Members can update dues"
ON public.customer_dues FOR UPDATE TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can delete dues"
ON public.customer_dues FOR DELETE TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

-- 3. pharmacy_settings: per-pharmacy config
CREATE TABLE public.pharmacy_settings (
  pharmacy_id UUID NOT NULL PRIMARY KEY,
  starting_cash_balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy settings"
ON public.pharmacy_settings FOR SELECT TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can insert pharmacy settings"
ON public.pharmacy_settings FOR INSERT TO authenticated
WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "Admins can update pharmacy settings"
ON public.pharmacy_settings FOR UPDATE TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

-- updated_at trigger function (reusable)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_dues_updated_at
BEFORE UPDATE ON public.customer_dues
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_pharmacy_settings_updated_at
BEFORE UPDATE ON public.pharmacy_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();