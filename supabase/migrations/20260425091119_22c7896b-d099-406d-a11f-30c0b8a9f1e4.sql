
-- ============ notes table ============
CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  title text,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_numbers text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  color text NOT NULL DEFAULT 'default',
  is_pinned boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  image_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_pharmacy_id ON public.notes(pharmacy_id);
CREATE INDEX idx_notes_creator_id ON public.notes(creator_id);
CREATE INDEX idx_notes_updated_at ON public.notes(updated_at DESC);
CREATE INDEX idx_notes_tags ON public.notes USING GIN(tags);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own or shared pharmacy notes"
  ON public.notes FOR SELECT
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR (pharmacy_id = public.get_user_pharmacy_id() AND is_public = true)
  );

CREATE POLICY "Users create own notes in their pharmacy"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND pharmacy_id = public.get_user_pharmacy_id()
  );

CREATE POLICY "Creator can update their own notes"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (
    creator_id = auth.uid()
    AND pharmacy_id = public.get_user_pharmacy_id()
  );

CREATE POLICY "Creator or admin can delete notes"
  ON public.notes FOR DELETE
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  );

-- updated_at trigger
CREATE TRIGGER notes_touch_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ============ helper function: pharmacy member names ============
CREATE OR REPLACE FUNCTION public.get_pharmacy_member_names()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.pharmacy_id = public.get_user_pharmacy_id();
$$;

-- ============ storage bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-attachments', 'note-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (path layout: {pharmacy_id}/{note_id}/{file})
CREATE POLICY "Note attachments are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'note-attachments');

CREATE POLICY "Pharmacy members can upload note attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'note-attachments'
    AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  );

CREATE POLICY "Pharmacy members can update note attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'note-attachments'
    AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  );

CREATE POLICY "Pharmacy members can delete note attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'note-attachments'
    AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  );
