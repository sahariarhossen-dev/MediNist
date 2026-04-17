
-- 1. Pharmacy sensitive fields: split into admin-only view, restrict base table to admins
-- Drop existing SELECT policy on pharmacies; replace with admin-only access
DROP POLICY IF EXISTS "Pharmacy users can view their own pharmacy" ON public.pharmacies;

-- Admins get full row access
CREATE POLICY "Admins can view full pharmacy"
ON public.pharmacies
FOR SELECT
TO authenticated
USING (
  id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid())
  AND public.is_pharmacy_admin()
);

-- Public-safe view for all pharmacy members (excludes drug_license, trade_license, phone, email, proprietor_name)
CREATE OR REPLACE VIEW public.pharmacies_public
WITH (security_invoker = on) AS
SELECT
  id,
  name,
  address,
  division,
  district,
  upazila,
  logo_url,
  cover_url,
  invoice_footer,
  default_discount,
  created_at
FROM public.pharmacies
WHERE id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid());

GRANT SELECT ON public.pharmacies_public TO authenticated;

-- Allow non-admin members SELECT on the base table for the non-sensitive columns via the view's security_invoker
-- The view runs as the invoker so we still need a SELECT policy. Add a permissive policy that allows members to SELECT
-- (column-level filtering happens through the view; we cannot column-restrict via RLS, so we keep base table admin-only
-- and rely on the view for non-admins). Update view to use SECURITY DEFINER pattern via a function instead.
DROP VIEW IF EXISTS public.pharmacies_public;

-- Use a SECURITY DEFINER function to expose non-sensitive fields to all members
CREATE OR REPLACE FUNCTION public.get_my_pharmacy_public()
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  division text,
  district text,
  upazila text,
  logo_url text,
  cover_url text,
  invoice_footer text,
  default_discount numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.address, p.division, p.district, p.upazila,
         p.logo_url, p.cover_url, p.invoice_footer, p.default_discount, p.created_at
  FROM public.pharmacies p
  WHERE p.id = (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_pharmacy_public() TO authenticated;


-- 2. shop_staff: restrict SELECT to admins only (emails are sensitive)
DROP POLICY IF EXISTS "Members can view pharmacy staff" ON public.shop_staff;

CREATE POLICY "Admins can view pharmacy staff"
ON public.shop_staff
FOR SELECT
TO authenticated
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND public.is_pharmacy_admin()
);


-- 3. Storage: block listing of pharmacy-assets bucket while keeping files publicly readable via CDN URL
-- Public buckets serve files through the CDN endpoint which bypasses RLS, so removing/restricting
-- the SELECT policy on storage.objects only blocks the .list() API, not direct URL access.
DROP POLICY IF EXISTS "Public read access for pharmacy-assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view pharmacy-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Pharmacy assets are publicly accessible" ON storage.objects;

-- Only admins of the owning pharmacy can list files in pharmacy-assets
CREATE POLICY "Pharmacy admins can list their pharmacy-assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pharmacy-assets'
  AND (storage.foldername(name))[1] = public.get_user_pharmacy_id()::text
  AND public.is_pharmacy_admin()
);
