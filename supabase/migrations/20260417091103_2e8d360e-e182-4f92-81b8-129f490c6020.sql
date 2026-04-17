-- AI chat memory tables for persistent conversations

CREATE TABLE public.ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pharmacy_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_user_updated 
  ON public.ai_conversations (user_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations"
  ON public.ai_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own conversations"
  ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Users can update their own conversations"
  ON public.ai_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own conversations"
  ON public.ai_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());


CREATE TABLE public.ai_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conv_created 
  ON public.ai_messages (conversation_id, created_at ASC);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their conversations"
  ON public.ai_messages FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()));

CREATE POLICY "Users can create messages in their conversations"
  ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (conversation_id IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete messages in their conversations"
  ON public.ai_messages FOR DELETE TO authenticated
  USING (conversation_id IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()));


-- Trigger: bump conversation updated_at + auto-set title from first user message
CREATE OR REPLACE FUNCTION public.ai_messages_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_count int;
BEGIN
  UPDATE public.ai_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;

  IF NEW.role = 'user' THEN
    SELECT count(*) INTO msg_count
    FROM public.ai_messages
    WHERE conversation_id = NEW.conversation_id AND role = 'user';

    IF msg_count = 1 THEN
      UPDATE public.ai_conversations
      SET title = left(NEW.content, 50)
      WHERE id = NEW.conversation_id AND title = 'New chat';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_messages_after_insert_trg
AFTER INSERT ON public.ai_messages
FOR EACH ROW EXECUTE FUNCTION public.ai_messages_after_insert();
