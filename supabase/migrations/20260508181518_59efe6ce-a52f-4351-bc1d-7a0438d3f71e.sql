
-- 1. Tighten cash_transactions UPDATE: admin/manager only
DROP POLICY IF EXISTS "Creator or admin can update cash transactions" ON public.cash_transactions;
CREATE POLICY "Admins and managers can update cash transactions"
  ON public.cash_transactions FOR UPDATE
  USING (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager())
  WITH CHECK (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager());

-- Also tighten INSERT to admin/manager (was: any member)
DROP POLICY IF EXISTS "Members can create cash transactions" ON public.cash_transactions;
CREATE POLICY "Admins and managers can create cash transactions"
  ON public.cash_transactions FOR INSERT
  WITH CHECK (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager() AND user_id = auth.uid());

-- 2. Tighten daily_closings INSERT/UPDATE to admin/manager
DROP POLICY IF EXISTS "Members can create pharmacy closings" ON public.daily_closings;
CREATE POLICY "Admins and managers can create pharmacy closings"
  ON public.daily_closings FOR INSERT
  WITH CHECK (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager());

DROP POLICY IF EXISTS "Members can update pharmacy closings" ON public.daily_closings;
CREATE POLICY "Admins and managers can update pharmacy closings"
  ON public.daily_closings FOR UPDATE
  USING (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager())
  WITH CHECK (pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager());

-- 3. Drop the uploader-only SELECT policy on chat-attachments so only current room members can read
DROP POLICY IF EXISTS "Chat attachments readable by uploader" ON storage.objects;

-- 4. Revoke EXECUTE on SECURITY DEFINER helper from anon (auth-only)
REVOKE EXECUTE ON FUNCTION public.is_pharmacy_admin_or_manager() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_admin_or_manager() TO authenticated;

-- 5. Remove sensitive financial tables from Realtime publication so row payloads are not broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.cash_transactions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.daily_closings;
ALTER PUBLICATION supabase_realtime DROP TABLE public.subscription_payments;
