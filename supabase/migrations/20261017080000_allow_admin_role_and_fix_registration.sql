-- Migration: 20261017080000_allow_admin_role_and_fix_registration.sql
-- Description:
-- 1. Restore backward-compatibility for 'admin' role in profiles and shop_staff check constraints.
--    This fixes the registration error "Failed to set up admin account. Please try again" where the
--    deployed register-pharmacy Edge Function promotes the newly registered user to role = 'admin',
--    which previously violated profiles_role_check (restricted strictly to owner, manager, salesman).
-- 2. Update is_pharmacy_owner, is_pharmacy_admin, and manager SQL functions to recognize both 'owner' and 'admin'.
-- 3. Grant appropriate execute permissions on helper functions.

-- ============================================================================
-- 1. UPDATE ROLE CHECK CONSTRAINTS ON PROFILES AND SHOP_STAFF
-- ============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'salesman'));

ALTER TABLE public.shop_staff
  DROP CONSTRAINT IF EXISTS shop_staff_role_check;

ALTER TABLE public.shop_staff
  ADD CONSTRAINT shop_staff_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'salesman'));

-- ============================================================================
-- 2. UPDATE SQL RBAC & SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- Strict Owner & Admin check
CREATE OR REPLACE FUNCTION public.is_pharmacy_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(trim(coalesce(role, ''))) IN ('owner', 'admin')
      AND pharmacy_id IS NOT NULL
  );
$$;

-- Backward-compatible alias
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_pharmacy_owner();
$$;

-- Owner, Admin, or Manager check
CREATE OR REPLACE FUNCTION public.is_pharmacy_owner_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(trim(coalesce(role, ''))) IN ('owner', 'admin', 'manager')
      AND pharmacy_id IS NOT NULL
  );
$$;

-- Backward-compatible alias
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_pharmacy_owner_or_manager();
$$;

-- ============================================================================
-- 3. PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_pharmacy_owner() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_owner_or_manager() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_admin_or_manager() TO authenticated, anon;
