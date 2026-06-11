
-- 1) Fix chat-attachments upload policy to enforce room membership
DROP POLICY IF EXISTS "Users can upload to their own chat folder" ON storage.objects;
CREATE POLICY "Users can upload to their own chat folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.is_room_member(NULLIF((storage.foldername(name))[2], '')::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Users can update their own chat uploads" ON storage.objects;
CREATE POLICY "Users can update their own chat uploads"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.is_room_member(NULLIF((storage.foldername(name))[2], '')::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.is_room_member(NULLIF((storage.foldername(name))[2], '')::uuid, auth.uid())
);

-- 2) Remove invitee self-read on shop_staff so the invitation token is never client-readable.
-- Acceptance flows use SECURITY DEFINER RPCs (get_invitation_by_token, accept_staff_invitation),
-- and admin reads are covered by the existing "Admins can view pharmacy staff" policy.
DROP POLICY IF EXISTS "Staff can view their own row" ON public.shop_staff;
