
-- Replace the broad public read policy on note-attachments with a pharmacy-scoped one
DROP POLICY IF EXISTS "Note attachments are publicly readable" ON storage.objects;

-- Make the bucket non-public so the linter is satisfied; access is controlled by RLS below
UPDATE storage.buckets SET public = false WHERE id = 'note-attachments';

CREATE POLICY "Pharmacy members can read their note attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'note-attachments'
    AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  );
