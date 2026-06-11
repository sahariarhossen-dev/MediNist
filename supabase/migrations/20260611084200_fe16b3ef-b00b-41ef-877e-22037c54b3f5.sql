
DROP POLICY IF EXISTS "Admins and managers can create cash transactions" ON public.cash_transactions;
CREATE POLICY "Admins and managers can create cash transactions" ON public.cash_transactions
  FOR INSERT TO authenticated
  WITH CHECK ((pharmacy_id = get_user_pharmacy_id()) AND is_pharmacy_admin_or_manager() AND (user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins and managers can update cash transactions" ON public.cash_transactions;
CREATE POLICY "Admins and managers can update cash transactions" ON public.cash_transactions
  FOR UPDATE TO authenticated
  USING ((pharmacy_id = get_user_pharmacy_id()) AND is_pharmacy_admin_or_manager())
  WITH CHECK ((pharmacy_id = get_user_pharmacy_id()) AND is_pharmacy_admin_or_manager());

DROP POLICY IF EXISTS "Admins and managers can create pharmacy closings" ON public.daily_closings;
CREATE POLICY "Admins and managers can create pharmacy closings" ON public.daily_closings
  FOR INSERT TO authenticated
  WITH CHECK ((pharmacy_id = get_user_pharmacy_id()) AND is_pharmacy_admin_or_manager());

DROP POLICY IF EXISTS "Admins and managers can update pharmacy closings" ON public.daily_closings;
CREATE POLICY "Admins and managers can update pharmacy closings" ON public.daily_closings
  FOR UPDATE TO authenticated
  USING ((pharmacy_id = get_user_pharmacy_id()) AND is_pharmacy_admin_or_manager())
  WITH CHECK ((pharmacy_id = get_user_pharmacy_id()) AND is_pharmacy_admin_or_manager());

CREATE POLICY "Users can update their own chat uploads" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-attachments' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'chat-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);
