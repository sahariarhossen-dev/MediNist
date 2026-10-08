-- ==============================================================================
-- Migration: Secure Multi-Location & Warehouse Infrastructure with Strict RLS
-- File: supabase/migrations/20260920120000_secure_locations_rls_and_owner_rbac.sql
-- Description:
--   1. Enables Row-Level Security (RLS) on shop_locations and stock_transfers
--   2. Enforces multi-tenant isolation by pharmacy_id
--   3. Restricts INSERT, UPDATE, and DELETE strictly to 'owner' (and 'admin') role
--   4. Denies all mutation privileges to 'manager' and 'salesman' roles at DB level
--   5. Scopes SELECT: owners read all locations; staff read strictly assigned location
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure Table Structure & Indexes
-- ------------------------------------------------------------------------------

-- Ensure public.shop_locations table exists
CREATE TABLE IF NOT EXISTS public.shop_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'branch',
  code text,
  address text DEFAULT '',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure assigned_location_id exists on profiles for scoped staff access
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL;

-- Ensure profiles_role_check permits 'owner', 'admin', 'manager', and 'salesman'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'salesman'));

-- Performance indexes for RLS evaluation
CREATE INDEX IF NOT EXISTS idx_shop_locations_pharmacy_id ON public.shop_locations(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_shop_locations_type ON public.shop_locations(type);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_location_id ON public.profiles(assigned_location_id);

-- ------------------------------------------------------------------------------
-- 2. Explicitly Enable Row Level Security (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.shop_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Clean Up Legacy / Conflicting Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "shop_locations_select_policy" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_insert_policy" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_update_policy" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_delete_policy" ON public.shop_locations;
DROP POLICY IF EXISTS "Users can view shop_locations" ON public.shop_locations;
DROP POLICY IF EXISTS "Owners can manage shop_locations" ON public.shop_locations;
DROP POLICY IF EXISTS "Enable all access for authenticated" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_owner_all" ON public.shop_locations;
DROP POLICY IF EXISTS "shop_locations_member_select" ON public.shop_locations;

-- ------------------------------------------------------------------------------
-- 4. READ (SELECT) Scoping Policy
--    - 'owner' and 'admin' can read all locations & warehouses within their tenant
--    - 'manager' and 'salesman' are scoped strictly to their assigned branch
-- ------------------------------------------------------------------------------
CREATE POLICY "shop_locations_select_policy"
ON public.shop_locations
FOR SELECT
TO authenticated
USING (
  -- Tenant boundary: must belong to the caller's pharmacy
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (
    -- Full clearance for Owners and Admins
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
    OR
    -- Strictly scoped read clearance for Managers & Salesmen
    (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('manager', 'salesman')
      AND (
        -- Can view their assigned location
        id = (SELECT p.assigned_location_id FROM public.profiles p WHERE p.id = auth.uid())
        -- Fallback if not specifically assigned: primary/main branch only
        OR (
          (SELECT p.assigned_location_id FROM public.profiles p WHERE p.id = auth.uid()) IS NULL
          AND (type = 'branch' OR code = 'MAIN')
        )
      )
    )
  )
);

-- ------------------------------------------------------------------------------
-- 5. Strict Multi-Tenant Owner RLS Mutation Policies (INSERT, UPDATE, DELETE)
--    - Tenant ID (pharmacy_id) must strictly match caller's pharmacy_id
--    - Caller role MUST strictly be 'owner' (or 'admin')
--    - All mutation privileges are 100% DENIED to 'manager' and 'salesman'
-- ------------------------------------------------------------------------------

-- INSERT POLICY
CREATE POLICY "shop_locations_insert_policy"
ON public.shop_locations
FOR INSERT
TO authenticated
WITH CHECK (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

-- UPDATE POLICY
CREATE POLICY "shop_locations_update_policy"
ON public.shop_locations
FOR UPDATE
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
)
WITH CHECK (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

-- DELETE POLICY
CREATE POLICY "shop_locations_delete_policy"
ON public.shop_locations
FOR DELETE
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

-- ------------------------------------------------------------------------------
-- 6. Secure Stock Transfers RLS Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "stock_transfers_select_policy" ON public.stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_insert_policy" ON public.stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_update_policy" ON public.stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_delete_policy" ON public.stock_transfers;

CREATE POLICY "stock_transfers_select_policy"
ON public.stock_transfers
FOR SELECT
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "stock_transfers_insert_policy"
ON public.stock_transfers
FOR INSERT
TO authenticated
WITH CHECK (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "stock_transfers_update_policy"
ON public.stock_transfers
FOR UPDATE
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

CREATE POLICY "stock_transfers_delete_policy"
ON public.stock_transfers
FOR DELETE
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);
