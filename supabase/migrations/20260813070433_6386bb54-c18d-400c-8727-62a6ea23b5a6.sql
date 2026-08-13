CREATE OR REPLACE FUNCTION public.extend_subscription_admin(
  _pharmacy_id uuid,
  _user_id uuid,
  _days integer,
  _amount numeric,
  _provider text DEFAULT 'manual',
  _invoice_id text DEFAULT NULL
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current timestamptz;
  v_new timestamptz;
BEGIN
  IF _pharmacy_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'pharmacy and user required' USING ERRCODE = '22023';
  END IF;
  IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN
    RAISE EXCEPTION 'Invalid duration' USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;

  SELECT subscription_expiry INTO v_current FROM public.pharmacies WHERE id = _pharmacy_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pharmacy not found' USING ERRCODE = 'P0002';
  END IF;

  v_new := GREATEST(COALESCE(v_current, now()), now()) + make_interval(days => _days);

  UPDATE public.pharmacies
     SET subscription_expiry = v_new,
         subscription_started_at = COALESCE(subscription_started_at, now())
   WHERE id = _pharmacy_id;

  INSERT INTO public.subscription_payments (pharmacy_id, user_id, amount_bdt, duration_days, status, provider, invoice_id)
  VALUES (_pharmacy_id, _user_id, _amount, _days, 'success', COALESCE(_provider,'manual'), _invoice_id);

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.extend_subscription_admin(uuid, uuid, integer, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_subscription_admin(uuid, uuid, integer, numeric, text, text) TO service_role;