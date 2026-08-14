DROP POLICY IF EXISTS "Pharmacy users can add members via SECURITY DEFINER fn" ON public.chat_room_members;

CREATE POLICY "Pharmacy users can add members via SECURITY DEFINER fn"
ON public.chat_room_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE r.id = chat_room_members.room_id
      AND r.pharmacy_id = public.get_user_pharmacy_id()
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = chat_room_members.user_id
      AND p.pharmacy_id = public.get_user_pharmacy_id()
  )
  AND (
    public.is_pharmacy_admin()
    OR (
      chat_room_members.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.chat_rooms r
        WHERE r.id = chat_room_members.room_id
          AND r.created_by = auth.uid()
      )
    )
  )
);