-- Migration: 20261017100000_secure_chat_multi_tenant_isolation.sql
-- Description:
-- 1. Strictly enforce Row Level Security (RLS) on public.profiles and public.shop_staff
--    so users can NEVER query or view profiles across pharmacy boundaries.
-- 2. Implement row_security = off in helper functions to PREVENT infinite recursion (Error 42P17).
-- 3. Drop all previous RPC signatures with CASCADE to prevent return-type mismatch (Error 42P13).
-- 4. Provide tenant-isolated member presence, member directory, and direct room RPCs.

-- ============================================================================
-- 1. RECURSION-SAFE get_user_pharmacy_id()
-- ============================================================================

-- Must have SET row_security = off to avoid PostgreSQL 42P17 infinite recursion 
-- when called from within public.profiles RLS policies
CREATE OR REPLACE FUNCTION public.get_user_pharmacy_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_pharmacy_id uuid;
BEGIN
  SELECT pharmacy_id INTO v_pharmacy_id 
  FROM public.profiles 
  WHERE id = auth.uid();
  RETURN v_pharmacy_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_pharmacy_id() TO authenticated, service_role;

-- ============================================================================
-- 2. ROW LEVEL SECURITY ON public.profiles
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop legacy or insecure policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Pharmacy members can view profiles in same pharmacy" ON public.profiles;
DROP POLICY IF EXISTS "Allow read-only select for dashboard" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

-- Allow users to view their own profile (Fast path)
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Allow users to view colleagues within the same pharmacy
CREATE POLICY "Pharmacy members can view profiles in same pharmacy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  pharmacy_id IS NOT NULL 
  AND pharmacy_id = public.get_user_pharmacy_id()
);

-- Users can only update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ============================================================================
-- 3. ROW LEVEL SECURITY ON public.shop_staff
-- ============================================================================

ALTER TABLE public.shop_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff accessible by pharmacy members" ON public.shop_staff;
DROP POLICY IF EXISTS "Staff viewable by pharmacy members" ON public.shop_staff;
DROP POLICY IF EXISTS "Members can view pharmacy staff" ON public.shop_staff;

CREATE POLICY "Staff accessible by pharmacy members"
ON public.shop_staff
FOR SELECT
TO authenticated
USING (
  pharmacy_id = public.get_user_pharmacy_id()
);

-- ============================================================================
-- 4. TENANT-ISOLATED RPC: get_pharmacy_member_presence()
-- ============================================================================

-- Use CASCADE to safely remove old return type signatures
DROP FUNCTION IF EXISTS public.get_pharmacy_member_presence() CASCADE;
DROP FUNCTION IF EXISTS public.get_pharmacy_member_presence(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_pharmacy_member_presence()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  role text,
  last_seen timestamptz,
  assigned_location_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_me uuid := auth.uid();
BEGIN
  IF v_pharmacy IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.id AS user_id,
    COALESCE(p.full_name, 'Staff Member')::text AS full_name,
    p.avatar_url,
    COALESCE(p.role, 'salesman')::text AS role,
    p.last_seen,
    p.assigned_location_id
  FROM public.profiles p
  WHERE p.pharmacy_id = v_pharmacy
    AND p.id <> v_me
  ORDER BY 
    CASE WHEN p.role IN ('owner', 'admin') THEN 0 ELSE 1 END,
    p.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pharmacy_member_presence() TO authenticated, service_role;

-- ============================================================================
-- 5. TENANT-ISOLATED RPC: get_pharmacy_member_directory()
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_pharmacy_member_directory() CASCADE;
DROP FUNCTION IF EXISTS public.get_pharmacy_member_directory(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_pharmacy_member_directory(_location_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  role text,
  phone text,
  last_seen timestamptz,
  assigned_location_id uuid,
  location_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_me uuid := auth.uid();
BEGIN
  IF v_pharmacy IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(p.full_name, 'Staff Member')::text AS full_name,
    p.avatar_url,
    COALESCE(p.role, 'salesman')::text AS role,
    p.phone,
    p.last_seen,
    p.assigned_location_id,
    loc.name AS location_name
  FROM public.profiles p
  LEFT JOIN public.shop_locations loc ON loc.id = p.assigned_location_id
  WHERE p.pharmacy_id = v_pharmacy
    AND p.id <> v_me
    AND (_location_id IS NULL OR p.assigned_location_id = _location_id OR p.role IN ('owner', 'admin'))
  ORDER BY 
    CASE WHEN p.role IN ('owner', 'admin') THEN 0 ELSE 1 END,
    p.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pharmacy_member_directory(uuid) TO authenticated, service_role;

-- ============================================================================
-- 6. VERIFY DIRECT ROOM VALIDATION: get_or_create_direct_room()
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_or_create_direct_room(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_room(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_other_pharmacy uuid;
  v_room uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;

  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No active pharmacy associated with account' USING ERRCODE='42501';
  END IF;

  IF v_me = _other_user THEN
    RAISE EXCEPTION 'Cannot create direct room with yourself' USING ERRCODE='22023';
  END IF;

  -- Ensure target other_user belongs to the exact same pharmacy
  SELECT pharmacy_id INTO v_other_pharmacy 
  FROM public.profiles 
  WHERE id = _other_user;

  IF v_other_pharmacy IS NULL OR v_other_pharmacy <> v_pharmacy THEN
    RAISE EXCEPTION 'Security Violation: Cannot start chat with user outside your pharmacy tenant' USING ERRCODE='42501';
  END IF;

  -- Find existing direct room between these two members within this pharmacy
  SELECT r.id INTO v_room
  FROM public.chat_rooms r
  WHERE r.pharmacy_id = v_pharmacy
    AND r.type = 'direct'
    AND EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id AND m.user_id = v_me)
    AND EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id AND m.user_id = _other_user)
  LIMIT 1;

  IF v_room IS NOT NULL THEN
    RETURN v_room;
  END IF;

  -- Create fresh direct chat room
  INSERT INTO public.chat_rooms (pharmacy_id, type, created_by)
  VALUES (v_pharmacy, 'direct', v_me)
  RETURNING id INTO v_room;

  INSERT INTO public.chat_room_members (room_id, user_id, is_admin)
  VALUES 
    (v_room, v_me, true),
    (v_room, _other_user, false);

  RETURN v_room;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_room(uuid) TO authenticated, service_role;
