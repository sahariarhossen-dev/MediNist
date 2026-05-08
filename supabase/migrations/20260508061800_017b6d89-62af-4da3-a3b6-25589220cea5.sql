
-- Helper: is current user admin or manager
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin_or_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin','manager')
      AND pharmacy_id IS NOT NULL
  );
$$;

-- cash_transactions: admin/manager only
DROP POLICY IF EXISTS "Members can view pharmacy cash transactions" ON public.cash_transactions;
CREATE POLICY "Admins and managers view cash transactions"
ON public.cash_transactions FOR SELECT TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin_or_manager());

-- daily_closings: admin/manager only
DROP POLICY IF EXISTS "Members can view pharmacy closings" ON public.daily_closings;
CREATE POLICY "Admins and managers view daily closings"
ON public.daily_closings FOR SELECT TO authenticated
USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin_or_manager());

-- sales: admin/manager all; salesman own only
DROP POLICY IF EXISTS "Members can view pharmacy sales" ON public.sales;
CREATE POLICY "Admins managers view all sales, others own"
ON public.sales FOR SELECT TO authenticated
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (public.is_pharmacy_admin_or_manager() OR user_id = auth.uid())
);

-- sale_items: follow sales visibility
DROP POLICY IF EXISTS "Members can view pharmacy sale items" ON public.sale_items;
CREATE POLICY "View sale items for visible sales"
ON public.sale_items FOR SELECT TO authenticated
USING (
  sale_id IN (
    SELECT s.id FROM public.sales s
    WHERE s.pharmacy_id = public.get_user_pharmacy_id()
      AND (public.is_pharmacy_admin_or_manager() OR s.user_id = auth.uid())
  )
);

-- Chat attachments: scope read to specific room. Path convention: <user_id>/<room_id>/<file>
-- Existing uploader-only policy stays. Replace cross-room policy with room-scoped one.
DROP POLICY IF EXISTS "Room members can read chat attachments" ON storage.objects;
CREATE POLICY "Room members can read chat attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_room_member(
    NULLIF((storage.foldername(name))[2], '')::uuid,
    auth.uid()
  )
);

-- medex_cache: explicit deny-all to silence "RLS enabled no policy" linter; backend-only via service role
CREATE POLICY "Backend only - no client access"
ON public.medex_cache FOR SELECT TO authenticated
USING (false);
COMMENT ON TABLE public.medex_cache IS 'Backend-only cache. Accessed via service role from edge functions. No client policies by design.';
