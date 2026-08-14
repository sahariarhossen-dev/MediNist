-- 1. Remove client-side pharmacy INSERT path (registration goes through the register-pharmacy edge function with the service role)
DROP POLICY IF EXISTS "Users can create pharmacy during onboarding" ON public.pharmacies;

-- 2. Revoke EXECUTE on internal / trigger / admin-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.ai_messages_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_cash_transaction_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_customer_ledger_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sale_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_pharmacy_id_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_customer_total_due() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_chat_messages_touch_room() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sale_completed_backfill_targets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sale_item_increment_targets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_resync_medicines_pack_info() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_truncate_master_medicines() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_demo_pharmacy(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_target_progress(uuid, uuid, uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;

-- 3. Public buckets: remove broad listing policies (public object URLs keep working)
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can read pharmacy-assets files by path" ON storage.objects;

CREATE POLICY "Members can list their pharmacy assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pharmacy-assets' AND (storage.foldername(name))[1] = (public.get_user_pharmacy_id())::text);

CREATE POLICY "Users can list their own avatar files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 4. Registration rate limiting log (server-only)
CREATE TABLE IF NOT EXISTS public.registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.registration_attempts TO service_role;
ALTER TABLE public.registration_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access to registration attempts"
ON public.registration_attempts FOR SELECT USING (false);
CREATE INDEX IF NOT EXISTS registration_attempts_ip_time_idx
ON public.registration_attempts (ip_hash, created_at DESC);