-- Allow chat room members to read attachments uploaded by fellow room members.
-- File path convention: <sender_uuid>/<filename>. We allow read if the
-- folder owner shares a chat room with the requester.
CREATE POLICY "Room members can read chat attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.chat_room_members me
    JOIN public.chat_room_members them ON them.room_id = me.room_id
    WHERE me.user_id = auth.uid()
      AND them.user_id::text = (storage.foldername(name))[1]
  )
);