-- 1. Tighten note-attachments storage policies to uploader-only for UPDATE/DELETE
DROP POLICY IF EXISTS "Pharmacy members can delete note attachments" ON storage.objects;
DROP POLICY IF EXISTS "Pharmacy members can update note attachments" ON storage.objects;

CREATE POLICY "Uploader can delete own note attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'note-attachments'
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Uploader can update own note attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'note-attachments'
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'note-attachments'
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 2. Admin-only DELETE policy on staff_activity_logs
CREATE POLICY "Pharmacy admins can delete staff activity logs"
ON public.staff_activity_logs FOR DELETE
TO authenticated
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND public.is_pharmacy_admin()
);

-- 3. Remove customer_ledger from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_ledger;
