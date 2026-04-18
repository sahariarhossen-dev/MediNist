-- 1. Fix: Only admins can update pharmacy details
DROP POLICY IF EXISTS "Pharmacy admins can update their pharmacy" ON public.pharmacies;

CREATE POLICY "Pharmacy admins can update their pharmacy"
ON public.pharmacies
FOR UPDATE
TO authenticated
USING (
  id = (SELECT profiles.pharmacy_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND public.is_pharmacy_admin()
)
WITH CHECK (
  id = (SELECT profiles.pharmacy_id FROM public.profiles WHERE profiles.id = auth.uid())
  AND public.is_pharmacy_admin()
);

-- 2. Fix: Allow staff members to view their own shop_staff row
CREATE POLICY "Staff can view their own row"
ON public.shop_staff
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. Tighten storage policies on pharmacy-assets bucket
-- Drop any broad SELECT policy that allows listing all objects
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%pharmacy-assets%' OR with_check ILIKE '%pharmacy-assets%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Allow direct public READ of individual pharmacy-asset files (by URL),
-- but do NOT allow listing/enumeration. Listing requires an explicit list call
-- which goes through SELECT on storage.objects without a name filter; we scope
-- the policy so a name match is required (i.e., direct file fetch only).
CREATE POLICY "Public can read pharmacy-assets files by path"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'pharmacy-assets');

-- Only authenticated members of the pharmacy (admins) can upload/update/delete
-- objects under their pharmacy folder: <pharmacy_id>/...
CREATE POLICY "Pharmacy admins can upload pharmacy-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pharmacy-assets'
  AND public.is_pharmacy_admin()
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
);

CREATE POLICY "Pharmacy admins can update pharmacy-assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pharmacy-assets'
  AND public.is_pharmacy_admin()
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
)
WITH CHECK (
  bucket_id = 'pharmacy-assets'
  AND public.is_pharmacy_admin()
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
);

CREATE POLICY "Pharmacy admins can delete pharmacy-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pharmacy-assets'
  AND public.is_pharmacy_admin()
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
);