
-- 1) Replace fragile chat-attachments SELECT policy with strict folder-owner check
DROP POLICY IF EXISTS "Chat attachments readable by uploader or room members" ON storage.objects;

CREATE POLICY "Chat attachments readable by uploader"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 2) Revoke EXECUTE from anon & public on all SECURITY DEFINER functions in public
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END$$;
