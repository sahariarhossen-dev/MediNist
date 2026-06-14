
-- 1. Revoke anon execute on get_master_companies (authenticated only)
REVOKE EXECUTE ON FUNCTION public.get_master_companies(text) FROM anon, PUBLIC;

-- 2. Set immutable search_path on realtime_room_topic_uuid
ALTER FUNCTION public.realtime_room_topic_uuid(text) SET search_path = public, pg_catalog;

-- 3. Add deny-all policies on backup/staging tables (RLS enabled, no policy = unclear intent)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    '_backup_medicines_pack_20260612',
    '_backup_master_pack_20260612',
    '_stg_medicines_new',
    '_backup_spider_medicines_20260613',
    'spider_sync_progress',
    '_backup_spider_full_20260613'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny all access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Deny all access" ON public.%I AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
