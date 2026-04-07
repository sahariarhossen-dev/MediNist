
-- Fix 1: Tighten pharmacy-assets storage policies
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload pharmacy assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pharmacy assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete pharmacy assets" ON storage.objects;

-- Recreate with pharmacy-scoped checks
CREATE POLICY "Users can upload their pharmacy assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pharmacy-assets' AND
  (storage.foldername(name))[1] = (
    SELECT pharmacy_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update their pharmacy assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'pharmacy-assets' AND
  (storage.foldername(name))[1] = (
    SELECT pharmacy_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete their pharmacy assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'pharmacy-assets' AND
  (storage.foldername(name))[1] = (
    SELECT pharmacy_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- Fix 2: Add explicit INSERT policy for pharmacies (onboarding only)
CREATE POLICY "Users can create pharmacy during onboarding"
ON public.pharmacies FOR INSERT TO authenticated
WITH CHECK (
  (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()) IS NULL
);

-- Deny all deletes on pharmacies
CREATE POLICY "No one can delete pharmacies"
ON public.pharmacies FOR DELETE TO authenticated
USING (false);
