-- Migration: Add audio_url and tenancy columns to public.ai_messages and configure chat-audio storage bucket

-- 1. Ensure public.ai_messages has audio_url, pharmacy_id, and user_id columns
ALTER TABLE public.ai_messages 
ADD COLUMN IF NOT EXISTS audio_url TEXT NULL;

ALTER TABLE public.ai_messages 
ADD COLUMN IF NOT EXISTS pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE;

ALTER TABLE public.ai_messages 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index on audio_url to optimize queries
CREATE INDEX IF NOT EXISTS idx_ai_messages_audio_url ON public.ai_messages(audio_url) WHERE audio_url IS NOT NULL;

-- 2. Configure public storage bucket 'chat-audio'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-audio',
  'chat-audio',
  true,
  20971520, -- 20MB limit
  ARRAY['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/x-m4a'];

-- 3. Storage Policies for chat-audio bucket

-- Drop existing conflicting policies if any
DROP POLICY IF EXISTS "Public read access for chat-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their uploaded chat audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their uploaded chat audio" ON storage.objects;

-- Allow public read access to all audio files in chat-audio bucket
CREATE POLICY "Public read access for chat-audio"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-audio');

-- Allow authenticated users to upload their audio files into their tenant folders
CREATE POLICY "Authenticated users can upload chat audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-audio'
  AND (storage.foldername(name))[1] IS NOT NULL
);

-- Allow authenticated users to update audio in chat-audio bucket
CREATE POLICY "Users can update their uploaded chat audio"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-audio');

-- Allow authenticated users to delete audio in chat-audio bucket
CREATE POLICY "Users can delete their uploaded chat audio"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-audio');
