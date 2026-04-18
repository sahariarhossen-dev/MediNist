CREATE TABLE public.daily_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id uuid NOT NULL,
  closing_date date NOT NULL,
  starting_balance numeric NOT NULL DEFAULT 0,
  total_sales numeric NOT NULL DEFAULT 0,
  total_cash_in numeric NOT NULL DEFAULT 0,
  total_payments numeric NOT NULL DEFAULT 0,
  total_due numeric NOT NULL DEFAULT 0,
  net_balance numeric NOT NULL DEFAULT 0,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, closing_date)
);

CREATE INDEX idx_daily_closings_pharmacy_date
  ON public.daily_closings (pharmacy_id, closing_date DESC);

ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy closings"
  ON public.daily_closings
  FOR SELECT
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Members can create pharmacy closings"
  ON public.daily_closings
  FOR INSERT
  TO authenticated
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Members can update pharmacy closings"
  ON public.daily_closings
  FOR UPDATE
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can delete pharmacy closings"
  ON public.daily_closings
  FOR DELETE
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());