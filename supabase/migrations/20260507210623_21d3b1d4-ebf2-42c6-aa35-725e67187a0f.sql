-- 1. Tighten is_pharmacy_admin() to require a non-null pharmacy_id, preventing
--    cross-pharmacy privilege confusion where any 'admin' role would satisfy
--    admin-gated checks regardless of pharmacy membership.
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND pharmacy_id IS NOT NULL
  );
$$;

-- 2. Restrict subscription_payments SELECT to pharmacy admins only — billing
--    records (amounts, invoice IDs, provider metadata) should not be visible
--    to salesmen / managers.
DROP POLICY IF EXISTS "Members view pharmacy subscription payments" ON public.subscription_payments;

CREATE POLICY "Admins view pharmacy subscription payments"
ON public.subscription_payments
FOR SELECT
TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());