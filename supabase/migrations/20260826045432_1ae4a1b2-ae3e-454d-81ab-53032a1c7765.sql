REVOKE ALL ON FUNCTION public.log_medicine_update_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_pharmacy_settings_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_pharmacy_discount_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_staff_permission_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_staff_access_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_customer_ledger_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_cash_transaction_activity() FROM PUBLIC, anon, authenticated;