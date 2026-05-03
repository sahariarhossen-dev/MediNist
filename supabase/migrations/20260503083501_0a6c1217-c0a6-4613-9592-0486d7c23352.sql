
ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS subscription_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'Pharmacy Pro',
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount_bdt numeric NOT NULL,
  duration_days int NOT NULL,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view pharmacy subscription payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins insert subscription payments"
  ON public.subscription_payments FOR INSERT TO authenticated
  WITH CHECK (
    pharmacy_id = public.get_user_pharmacy_id()
    AND user_id = auth.uid()
    AND public.is_pharmacy_admin()
  );

CREATE OR REPLACE FUNCTION public.extend_subscription(_days int, _amount numeric)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
  v_current timestamptz;
  v_base timestamptz;
  v_new timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN
    RAISE EXCEPTION 'Invalid duration' USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;

  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy associated with user' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_pharmacy_admin() THEN
    RAISE EXCEPTION 'Only pharmacy admins can renew the subscription' USING ERRCODE = '42501';
  END IF;

  SELECT subscription_expiry INTO v_current FROM public.pharmacies WHERE id = v_pharmacy;
  v_base := GREATEST(COALESCE(v_current, now()), now());
  v_new := v_base + make_interval(days => _days);

  UPDATE public.pharmacies
    SET subscription_expiry = v_new,
        subscription_started_at = COALESCE(subscription_started_at, now())
    WHERE id = v_pharmacy;

  INSERT INTO public.subscription_payments (pharmacy_id, user_id, amount_bdt, duration_days, status)
  VALUES (v_pharmacy, v_user, _amount, _days, 'success');

  RETURN v_new;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_payments;
ALTER TABLE public.pharmacies REPLICA IDENTITY FULL;
ALTER TABLE public.subscription_payments REPLICA IDENTITY FULL;
