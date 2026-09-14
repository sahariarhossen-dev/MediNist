-- BACKUP & RESTORATION DDL FOR LEGACY AI CHAT TABLES
-- Tables: ai_conversations, ai_messages, ai_thread_links, medex_cache
-- Saved on: 2026-09-09
-- Purpose: Reference / Rollback script if AI Chat is ever restored

-- 1. ai_conversations
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pharmacy_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  topic_key text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated 
  ON public.ai_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_active
  ON public.ai_conversations (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

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

-- 2. ai_messages
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_created 
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

-- Trigger function
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

DROP TRIGGER IF EXISTS ai_messages_after_insert_trg ON public.ai_messages;
CREATE TRIGGER ai_messages_after_insert_trg
AFTER INSERT ON public.ai_messages
FOR EACH ROW EXECUTE FUNCTION public.ai_messages_after_insert();

-- 3. ai_thread_links
CREATE TABLE IF NOT EXISTS public.ai_thread_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  from_conversation uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  to_conversation uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_conversation, to_conversation),
  CHECK (from_conversation <> to_conversation)
);

GRANT SELECT, INSERT, DELETE ON public.ai_thread_links TO authenticated;
GRANT ALL ON public.ai_thread_links TO service_role;

ALTER TABLE public.ai_thread_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_thread_links_select_own"
  ON public.ai_thread_links FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ai_thread_links_insert_own"
  ON public.ai_thread_links FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND from_conversation IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid())
    AND to_conversation IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid())
  );

CREATE POLICY "ai_thread_links_delete_own"
  ON public.ai_thread_links FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ai_thread_links_from ON public.ai_thread_links (from_conversation);

-- 4. medex_cache
CREATE TABLE IF NOT EXISTS public.medex_cache (
  brand_name text primary key,
  generic_name text,
  dosage_form text,
  strength text,
  manufacturer text,
  unit_price numeric,
  package_info text,
  indications text,
  dosage_instructions text,
  side_effects text,
  contraindications text,
  pharmacology text,
  source_url text,
  fetched_at timestamptz not null default now()
);

ALTER TABLE public.medex_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS medex_cache_fetched_at_idx ON public.medex_cache (fetched_at desc);
COMMENT ON TABLE public.medex_cache IS 'Backend-only cache. Accessed via service role from edge functions.';
