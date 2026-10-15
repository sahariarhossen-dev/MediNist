-- Migration: 20261015000000_dynamic_default_branch_and_rename_legacy.sql
-- Description:
-- 1. Upgrade handle_new_pharmacy_default_location() trigger:
--    - Sets name to exact pharmacy brand name (NEW.name)
--    - Sets code to NULL (strictly no 'MAIN' badge injection)
--    - Retains address, phone, email, and atomic profile assignment
-- 2. Clean and backfill legacy shop_locations:
--    - Renames legacy 'Main Branch' records to match parent pharmacy name
--    - Clears legacy 'MAIN' / 'main' codes to NULL on primary branches
--    - Syncs address and contact information

-- ============================================================================
-- 1. UPGRADE TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_pharmacy_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_loc_id uuid;
  v_clean_name text;
BEGIN
  -- Extract and sanitize the registered pharmacy brand name
  v_clean_name := NULLIF(TRIM(NEW.name), '');

  -- If a branch outlet for this pharmacy already exists, do not duplicate
  SELECT id INTO v_main_loc_id 
  FROM public.shop_locations 
  WHERE pharmacy_id = NEW.id 
  ORDER BY is_main DESC, created_at ASC 
  LIMIT 1;

  IF v_main_loc_id IS NOT NULL THEN
    -- If the existing branch was created with placeholder 'Main Branch', update it now
    IF v_clean_name IS NOT NULL THEN
      UPDATE public.shop_locations
      SET name = v_clean_name,
          code = NULL
      WHERE id = v_main_loc_id
        AND (name = 'Main Branch' OR name LIKE '% - Main Branch');
    END IF;

    -- Link any unassigned profile to the existing branch
    UPDATE public.profiles
    SET assigned_location_id = v_main_loc_id
    WHERE pharmacy_id = NEW.id
      AND assigned_location_id IS NULL;
    RETURN NEW;
  END IF;

  -- Insert primary shop location using the user's EXACT pharmacy name, code as NULL
  INSERT INTO public.shop_locations (
    pharmacy_id,
    name,
    type,
    code,
    address,
    is_main,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(v_clean_name, 'Pharmacy Outlet'),
    'branch',
    NULL, -- Explicitly NULL to prevent (MAIN) badge injection
    NEW.address,
    true,
    true,
    now(),
    now()
  )
  RETURNING id INTO v_main_loc_id;

  -- Link any profile already associated with this pharmacy
  UPDATE public.profiles
  SET assigned_location_id = v_main_loc_id
  WHERE pharmacy_id = NEW.id
    AND assigned_location_id IS NULL;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is active on public.pharmacies
DROP TRIGGER IF EXISTS trg_pharmacy_default_location ON public.pharmacies;
CREATE TRIGGER trg_pharmacy_default_location
  AFTER INSERT ON public.pharmacies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_pharmacy_default_location();

-- ============================================================================
-- 2. IDEMPOTENT BACKFILL: RENAME LEGACY RECORDS & PURGE 'MAIN' CODE
-- ============================================================================

-- A. Rename legacy 'Main Branch' to the parent pharmacy brand name
UPDATE public.shop_locations sl
SET 
  name = TRIM(p.name),
  updated_at = NOW()
FROM public.pharmacies p
WHERE sl.pharmacy_id = p.id
  AND sl.is_main = true
  AND (
    sl.name = 'Main Branch' 
    OR sl.name LIKE '% - Main Branch' 
    OR sl.name = 'Main Pharmacy'
    OR sl.name = 'Main Pharmacy - Main Branch'
  )
  AND p.name IS NOT NULL 
  AND TRIM(p.name) <> '';

-- B. Clear legacy 'MAIN' / 'main' codes on primary branches so UI renders clean brand titles
UPDATE public.shop_locations
SET 
  code = NULL,
  updated_at = NOW()
WHERE is_main = true 
  AND (UPPER(TRIM(code)) = 'MAIN' OR TRIM(code) = '');

-- C. Repair empty address or placeholder address
UPDATE public.shop_locations sl
SET 
  address = TRIM(p.address),
  updated_at = NOW()
FROM public.pharmacies p
WHERE sl.pharmacy_id = p.id
  AND (sl.address = 'Primary Pharmacy Location' OR sl.address IS NULL OR sl.address = '')
  AND p.address IS NOT NULL 
  AND TRIM(p.address) <> '';
