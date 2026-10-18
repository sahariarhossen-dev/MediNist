-- Migration: 20261017110000_restrict_single_facility_warehouse.sql
-- Description:
-- 1. Ensure type CHECK constraint permits ('branch', 'warehouse', 'shop', 'godown').
-- 2. Backfill existing misconfigured single-facility accounts: if a pharmacy has only 1 facility
--    and it is marked as a warehouse, heal it to 'branch'.
-- 3. Database Trigger: prevent single-facility pharmacies from being converted into warehouses
--    and prevent converting the last active retail branch into a warehouse.

-- ============================================================================
-- 1. ENSURE TYPE CONSTRAINT PERMITS BOTH LEGACY AND MODERN VALUES
-- ============================================================================

ALTER TABLE public.shop_locations DROP CONSTRAINT IF EXISTS shop_locations_type_check;
ALTER TABLE public.shop_locations 
  ADD CONSTRAINT shop_locations_type_check 
  CHECK (type IN ('branch', 'warehouse', 'shop', 'godown'));

-- ============================================================================
-- 2. AUTO-HEAL EXISTING MISCONFIGURED SINGLE FACILITY ACCOUNTS
-- ============================================================================

-- Any pharmacy with exactly 1 location that was set as warehouse/godown
-- is automatically restored to 'branch' so retail POS checkout functions properly.
WITH single_facility_pharmacies AS (
  SELECT pharmacy_id
  FROM public.shop_locations
  GROUP BY pharmacy_id
  HAVING COUNT(*) = 1
)
UPDATE public.shop_locations loc
SET 
  type = 'branch',
  is_main = true,
  is_active = true,
  updated_at = now()
FROM single_facility_pharmacies s
WHERE loc.pharmacy_id = s.pharmacy_id
  AND loc.type IN ('warehouse', 'godown');

-- ============================================================================
-- 3. DATABASE TRIGGER FUNCTION: prevent_single_facility_warehouse()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_single_facility_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_total_facilities int;
  v_other_retail_branches int;
BEGIN
  -- Only validate if the target type is warehouse / godown
  IF NEW.type IN ('warehouse', 'godown') THEN
    -- Check total facilities count for this pharmacy
    SELECT COUNT(*) INTO v_total_facilities
    FROM public.shop_locations
    WHERE pharmacy_id = NEW.pharmacy_id;

    -- For INSERT: Cannot create initial warehouse if 0 branches exist
    IF TG_OP = 'INSERT' AND v_total_facilities = 0 THEN
      RAISE EXCEPTION 'At least two branches are required to configure a warehouse. The primary facility must be a retail branch.'
        USING ERRCODE = '22023';
    END IF;

    -- For UPDATE: Cannot convert to warehouse if pharmacy has <= 1 facility
    IF TG_OP = 'UPDATE' AND v_total_facilities <= 1 THEN
      RAISE EXCEPTION 'At least two branches are required to configure a warehouse. Single facilities must operate as a retail branch.'
        USING ERRCODE = '22023';
    END IF;

    -- For UPDATE: Ensure at least one other active retail branch remains
    IF TG_OP = 'UPDATE' THEN
      SELECT COUNT(*) INTO v_other_retail_branches
      FROM public.shop_locations
      WHERE pharmacy_id = NEW.pharmacy_id
        AND id <> NEW.id
        AND type IN ('branch', 'shop')
        AND is_active = true;

      IF v_other_retail_branches = 0 THEN
        RAISE EXCEPTION 'Cannot convert to warehouse: At least one active retail branch must be maintained for POS operations.'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_single_facility_warehouse ON public.shop_locations;

CREATE TRIGGER trg_prevent_single_facility_warehouse
BEFORE INSERT OR UPDATE OF type ON public.shop_locations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_single_facility_warehouse();
