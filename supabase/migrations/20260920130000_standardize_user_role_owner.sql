-- Migration: 20260920130000_standardize_user_role_owner.sql
-- Description: Deprecate 'admin' user role and strictly standardize on 'owner' across database records, constraints, RLS policies, and SQL functions.

-- 1. Data Migration & Cleanup
-- Update all existing records where role is 'admin' to 'owner'
UPDATE public.profiles
SET role = 'owner'
WHERE role ILIKE 'admin';

UPDATE public.shop_staff
SET role = 'owner'
WHERE role ILIKE 'admin';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'shop_invitations'
  ) THEN
    UPDATE public.shop_invitations
    SET role = 'owner'
    WHERE role ILIKE 'admin';
  END IF;
END $$;

-- 2. Update Role Check Constraints on public.profiles and public.shop_staff
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'salesman'));

ALTER TABLE public.shop_staff
  DROP CONSTRAINT IF EXISTS shop_staff_role_check;

ALTER TABLE public.shop_staff
  ADD CONSTRAINT shop_staff_role_check
  CHECK (role IN ('owner', 'manager', 'salesman'));

-- 3. Update SQL Functions to recognize 'owner'

-- 3a. is_pharmacy_owner (Strict Owner Check)
CREATE OR REPLACE FUNCTION public.is_pharmacy_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(trim(coalesce(role, ''))) = 'owner'
      AND pharmacy_id IS NOT NULL
  );
$$;

-- 3b. is_pharmacy_admin (Backward-compatible alias pointing strictly to 'owner')
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_pharmacy_owner();
$$;

-- 3c. is_pharmacy_owner_or_manager
CREATE OR REPLACE FUNCTION public.is_pharmacy_owner_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(trim(coalesce(role, ''))) IN ('owner', 'manager')
      AND pharmacy_id IS NOT NULL
  );
$$;

-- 3d. is_pharmacy_admin_or_manager (Backward-compatible alias)
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_pharmacy_owner_or_manager();
$$;

-- 3e. Update seed_demo_pharmacy to assign 'owner' role to demo users
CREATE OR REPLACE FUNCTION public.seed_demo_pharmacy(_pharmacy_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := current_date;
  v_created timestamptz;
  i int;
  meds record;
  custs record;
BEGIN
  -- Promote the demo user's profile to 'owner'
  PERFORM set_config('app.bypass_profile_guards', 'on', true);
  UPDATE public.profiles
    SET pharmacy_id = _pharmacy_id,
        full_name = COALESCE(full_name, 'Demo Pharmacist'),
        role = 'owner',
        is_demo = true,
        terms_accepted = true,
        terms_accepted_at = now()
    WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_guards', 'off', true);
END;
$$;

-- 4. Re-enforce Strict Owner RLS on shop_locations and related location tables
-- Drop existing policies on shop_locations to remove any references to 'admin'
DROP POLICY IF EXISTS "shop_locations_insert_owner_only" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_update_owner_only" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_delete_owner_only" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_select_tenant_members" ON public.shop_locations;

CREATE POLICY "shop_locations_select_tenant_members"
ON public.shop_locations
FOR SELECT
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'owner'
    OR (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('manager', 'salesman')
      AND is_active = true
    )
  )
);

CREATE POLICY "shop_locations_insert_owner_only"
ON public.shop_locations
FOR INSERT
WITH CHECK (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'owner'
);

CREATE POLICY "shop_locations_update_owner_only"
ON public.shop_locations
FOR UPDATE
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'owner'
)
WITH CHECK (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'owner'
);

CREATE POLICY "shop_locations_delete_owner_only"
ON public.shop_locations
FOR DELETE
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'owner'
);
