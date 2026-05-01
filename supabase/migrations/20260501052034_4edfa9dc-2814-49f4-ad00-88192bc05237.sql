-- =============================================================
-- Chat / messaging system
-- =============================================================

-- ---------- chat_rooms ----------
CREATE TABLE public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('direct','group')),
  name text,
  avatar_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_rooms_pharmacy ON public.chat_rooms(pharmacy_id);

-- ---------- chat_room_members ----------
CREATE TABLE public.chat_room_members (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX idx_chat_room_members_user ON public.chat_room_members(user_id);

-- ---------- chat_messages ----------
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text,
  attachment_url text,
  attachment_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX idx_chat_messages_room_created ON public.chat_messages(room_id, created_at DESC);

-- =============================================================
-- Helper: is user member of room?
-- =============================================================
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = _room_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_admin(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = _room_id AND user_id = _user_id AND is_admin = true
  );
$$;

-- =============================================================
-- RLS
-- =============================================================
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- chat_rooms
CREATE POLICY "Members can view their rooms"
  ON public.chat_rooms FOR SELECT TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_room_member(id, auth.uid())
  );

CREATE POLICY "Pharmacy users can create rooms"
  ON public.chat_rooms FOR INSERT TO authenticated
  WITH CHECK (
    pharmacy_id = public.get_user_pharmacy_id()
    AND created_by = auth.uid()
    AND (type = 'direct' OR public.is_pharmacy_admin())
  );

CREATE POLICY "Admins or creator can update rooms"
  ON public.chat_rooms FOR UPDATE TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND (created_by = auth.uid() OR public.is_pharmacy_admin())
  );

CREATE POLICY "Admins or creator can delete rooms"
  ON public.chat_rooms FOR DELETE TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND (created_by = auth.uid() OR public.is_pharmacy_admin())
  );

-- chat_room_members
CREATE POLICY "Members can view membership of their rooms"
  ON public.chat_room_members FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Pharmacy users can add members via SECURITY DEFINER fn"
  ON public.chat_room_members FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow if current user is admin of this pharmacy
    public.is_pharmacy_admin()
    -- Or current user is adding themselves to a direct room they created
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.chat_rooms r
        WHERE r.id = room_id
          AND r.pharmacy_id = public.get_user_pharmacy_id()
          AND r.created_by = auth.uid()
      )
    )
  );

CREATE POLICY "Members can update their own read state"
  ON public.chat_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Pharmacy admins or self can remove member"
  ON public.chat_room_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR public.is_pharmacy_admin()
  );

-- chat_messages
CREATE POLICY "Room members can view messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Room members can send messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_room_member(room_id, auth.uid())
  );

CREATE POLICY "Sender within 5 min or admin can update message"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (
    (sender_id = auth.uid() AND created_at > now() - interval '5 minutes')
    OR public.is_pharmacy_admin()
  );

CREATE POLICY "Sender or pharmacy admin can delete message"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.is_pharmacy_admin());

-- =============================================================
-- Trigger: bump chat_rooms.updated_at on new message
-- =============================================================
CREATE OR REPLACE FUNCTION public.tg_chat_messages_touch_room()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_rooms SET updated_at = now() WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_touch_room
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_chat_messages_touch_room();

-- =============================================================
-- RPC: get_or_create_direct_room
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_or_create_direct_room(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_other_pharmacy uuid;
  v_room uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF v_me = _other_user THEN
    RAISE EXCEPTION 'Cannot create direct room with yourself' USING ERRCODE='22023';
  END IF;
  SELECT pharmacy_id INTO v_other_pharmacy FROM public.profiles WHERE id = _other_user;
  IF v_other_pharmacy IS NULL OR v_other_pharmacy <> v_pharmacy THEN
    RAISE EXCEPTION 'User not in your pharmacy' USING ERRCODE='42501';
  END IF;

  -- Find existing direct room with exactly these two members
  SELECT r.id INTO v_room
  FROM public.chat_rooms r
  WHERE r.pharmacy_id = v_pharmacy
    AND r.type = 'direct'
    AND EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id AND m.user_id = v_me)
    AND EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id AND m.user_id = _other_user)
  LIMIT 1;

  IF v_room IS NOT NULL THEN
    RETURN v_room;
  END IF;

  INSERT INTO public.chat_rooms (pharmacy_id, type, created_by)
  VALUES (v_pharmacy, 'direct', v_me)
  RETURNING id INTO v_room;

  INSERT INTO public.chat_room_members (room_id, user_id, is_admin)
  VALUES (v_room, v_me, true), (v_room, _other_user, false);

  RETURN v_room;
END;
$$;

-- =============================================================
-- RPC: create_group_room (admin-only)
-- =============================================================
CREATE OR REPLACE FUNCTION public.create_group_room(_name text, _member_ids uuid[], _avatar_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_room uuid;
  v_uid uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT public.is_pharmacy_admin() THEN
    RAISE EXCEPTION 'Only pharmacy admins can create groups' USING ERRCODE='42501';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Group name required' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.chat_rooms (pharmacy_id, type, name, avatar_url, created_by)
  VALUES (v_pharmacy, 'group', trim(_name), _avatar_url, v_me)
  RETURNING id INTO v_room;

  INSERT INTO public.chat_room_members (room_id, user_id, is_admin)
  VALUES (v_room, v_me, true);

  IF _member_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY _member_ids LOOP
      IF v_uid <> v_me AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND pharmacy_id = v_pharmacy) THEN
        INSERT INTO public.chat_room_members (room_id, user_id, is_admin)
        VALUES (v_room, v_uid, false)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_room;
END;
$$;

-- =============================================================
-- RPC: get_chat_inbox  -> rooms summary for the current user
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_chat_inbox()
RETURNS TABLE (
  room_id uuid,
  type text,
  display_name text,
  avatar_url text,
  other_user_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_rooms AS (
    SELECT r.id, r.type, r.name, r.avatar_url, m.last_read_at
    FROM public.chat_rooms r
    JOIN public.chat_room_members m ON m.room_id = r.id
    WHERE m.user_id = auth.uid()
      AND r.pharmacy_id = public.get_user_pharmacy_id()
  ),
  last_msgs AS (
    SELECT DISTINCT ON (cm.room_id)
      cm.room_id, cm.content, cm.attachment_url, cm.attachment_type, cm.created_at, cm.sender_id
    FROM public.chat_messages cm
    WHERE cm.room_id IN (SELECT id FROM my_rooms)
    ORDER BY cm.room_id, cm.created_at DESC
  ),
  others AS (
    SELECT m.room_id, m.user_id AS other_user_id
    FROM public.chat_room_members m
    WHERE m.room_id IN (SELECT id FROM my_rooms WHERE type = 'direct')
      AND m.user_id <> auth.uid()
  )
  SELECT
    r.id AS room_id,
    r.type,
    CASE WHEN r.type = 'group' THEN COALESCE(r.name, 'Group')
         ELSE COALESCE(p.full_name, 'Teammate') END AS display_name,
    CASE WHEN r.type = 'group' THEN r.avatar_url ELSE p.avatar_url END AS avatar_url,
    o.other_user_id,
    CASE
      WHEN lm.attachment_url IS NOT NULL AND COALESCE(lm.content,'') = '' THEN '📎 Attachment'
      ELSE lm.content
    END AS last_message,
    lm.created_at AS last_message_at,
    COALESCE((
      SELECT count(*)::int FROM public.chat_messages cm2
      WHERE cm2.room_id = r.id
        AND cm2.created_at > r.last_read_at
        AND cm2.sender_id <> auth.uid()
    ), 0) AS unread_count
  FROM my_rooms r
  LEFT JOIN others o ON o.room_id = r.id
  LEFT JOIN public.profiles p ON p.id = o.other_user_id
  LEFT JOIN last_msgs lm ON lm.room_id = r.id
  ORDER BY COALESCE(lm.created_at, now() - interval '100 years') DESC;
$$;

-- =============================================================
-- RPC: mark_room_read
-- =============================================================
CREATE OR REPLACE FUNCTION public.mark_room_read(_room_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.chat_room_members
  SET last_read_at = now()
  WHERE room_id = _room_id AND user_id = auth.uid();
$$;

-- =============================================================
-- Realtime
-- =============================================================
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.chat_room_members REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_room_members;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =============================================================
-- Storage bucket: chat-attachments
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can upload to their own chat folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own chat uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
