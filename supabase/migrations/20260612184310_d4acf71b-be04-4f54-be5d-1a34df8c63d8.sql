
-- 1) Fix chat_messages DELETE: scope sender branch to current pharmacy
DROP POLICY IF EXISTS "Sender or pharmacy admin can delete message" ON public.chat_messages;
CREATE POLICY "Sender or pharmacy admin can delete message"
ON public.chat_messages
FOR DELETE
USING (
  (sender_id = auth.uid() AND pharmacy_id = public.get_user_pharmacy_id())
  OR (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
);

-- 2) Hide raw invitation token from Data API; RPCs (SECURITY DEFINER) still work
REVOKE SELECT (token) ON public.shop_staff FROM authenticated;
REVOKE SELECT (token) ON public.shop_staff FROM anon;

-- 3) Add realtime room:* topic authorization scoped to room membership
DO $$
DECLARE v_room uuid;
BEGIN
  -- helper: extract room uuid from 'room:<uuid>' topic
  PERFORM 1;
END $$;

CREATE OR REPLACE FUNCTION public.realtime_room_topic_uuid(_topic text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _topic LIKE 'room:%' AND length(_topic) = 5 + 36
    THEN substring(_topic from 6)::uuid
    ELSE NULL
  END;
$$;

DROP POLICY IF EXISTS "Room members can read their room realtime topic" ON realtime.messages;
CREATE POLICY "Room members can read their room realtime topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'room:%'
  AND public.is_room_member(public.realtime_room_topic_uuid(realtime.topic()), auth.uid())
);

DROP POLICY IF EXISTS "Room members can publish to their room realtime topic" ON realtime.messages;
CREATE POLICY "Room members can publish to their room realtime topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'room:%'
  AND public.is_room_member(public.realtime_room_topic_uuid(realtime.topic()), auth.uid())
);
