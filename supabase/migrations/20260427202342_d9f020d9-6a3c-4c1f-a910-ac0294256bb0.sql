
-- 1. PRIVILEGE_ESCALATION: harden profiles update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND pharmacy_id IS NOT DISTINCT FROM (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- 2. EXPOSED_SENSITIVE_DATA: hide token column from invited staff
REVOKE SELECT (token) ON public.shop_staff FROM authenticated;
REVOKE SELECT (token) ON public.shop_staff FROM anon;

-- 3. anon SECURITY DEFINER functions: revoke EXECUTE from anon
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_presence() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_blind_closing(numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_last_seen() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_sale_activity() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_cash_transaction_activity() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_customer_ledger_activity() FROM anon, authenticated, PUBLIC;

-- 4. MISSING_REALTIME_AUTHORIZATION: restrict realtime channel subscriptions per pharmacy
-- Topic naming convention: "pharmacy:<pharmacy_id>" — clients must subscribe to their own pharmacy topic.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pharmacy members can read their realtime topic" ON realtime.messages;
CREATE POLICY "Pharmacy members can read their realtime topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'pharmacy:' || public.get_user_pharmacy_id()::text
);

DROP POLICY IF EXISTS "Pharmacy members can publish to their realtime topic" ON realtime.messages;
CREATE POLICY "Pharmacy members can publish to their realtime topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = 'pharmacy:' || public.get_user_pharmacy_id()::text
);
