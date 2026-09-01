ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS topic_key text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_active
  ON public.ai_conversations (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

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