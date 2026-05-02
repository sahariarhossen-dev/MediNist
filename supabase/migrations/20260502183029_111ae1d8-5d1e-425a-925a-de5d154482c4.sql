
-- 1. Scope chat_messages DELETE & UPDATE to admin's own pharmacy
DROP POLICY IF EXISTS "Sender or pharmacy admin can delete message" ON public.chat_messages;
CREATE POLICY "Sender or pharmacy admin can delete message"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  );

DROP POLICY IF EXISTS "Sender within 5 min or admin can update message" ON public.chat_messages;
CREATE POLICY "Sender within 5 min or admin can update message"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (
    (sender_id = auth.uid() AND created_at > now() - interval '5 minutes')
    OR (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  );

-- 2. Scope chat_room_members DELETE to the room's pharmacy
DROP POLICY IF EXISTS "Pharmacy admins or self can remove member" ON public.chat_room_members;
CREATE POLICY "Pharmacy admins or self can remove member"
  ON public.chat_room_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_pharmacy_admin()
      AND EXISTS (
        SELECT 1 FROM public.chat_rooms r
        WHERE r.id = chat_room_members.room_id
          AND r.pharmacy_id = public.get_user_pharmacy_id()
      )
    )
  );

-- 3. staff_settings: restrict salary/commission visibility to admins or the user themselves
DROP POLICY IF EXISTS "Members can view pharmacy staff settings" ON public.staff_settings;
CREATE POLICY "Admins or self can view staff settings"
  ON public.staff_settings FOR SELECT TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND (user_id = auth.uid() OR public.is_pharmacy_admin())
  );

-- 4. chat-attachments storage: restrict reads to uploader or room members
DROP POLICY IF EXISTS "Authenticated can read chat attachments" ON storage.objects;
CREATE POLICY "Chat attachments readable by uploader or room members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.chat_messages cm
        WHERE cm.attachment_url LIKE '%' || name || '%'
          AND public.is_room_member(cm.room_id, auth.uid())
      )
    )
  );

-- 5. Revoke EXECUTE from anon/public on SECURITY DEFINER functions that require an authenticated user
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_profile(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_directory() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_room_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_room(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_group_room(text, uuid[], text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_chat_inbox() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_room_read(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_pharmacy_staff_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_member_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_room(text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_room_read(uuid) TO authenticated;
