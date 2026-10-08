-- Migration: 20260922010000_fix_registration_branch_trigger.sql
-- Description: 
-- 1. Fix handle_new_pharmacy_default_location() trigger so that it uses the user's exact pharmacy name and address
-- 2. Prevent duplicate insertions if the edge function or application already created the branch
-- 3. Set valid location type ('branch') and default code ('MAIN')
-- 4. Clean up corrupted legacy branches where name was hardcoded as 'Main Branch' or address was 'Primary Pharmacy Location'

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
BEGIN
  -- If a branch outlet for this pharmacy already exists (e.g. provisioned by Edge Function), do not duplicate
  SELECT id INTO v_main_loc_id 
  FROM public.shop_locations 
  WHERE pharmacy_id = NEW.id 
  ORDER BY is_main DESC, created_at ASC 
  LIMIT 1;

  IF v_main_loc_id IS NOT NULL THEN
    -- Link any unassigned profile to the existing branch
    UPDATE public.profiles
    SET assigned_location_id = v_main_loc_id
    WHERE pharmacy_id = NEW.id
      AND assigned_location_id IS NULL;
    RETURN NEW;
  END IF;

  -- Insert primary shop location using the user's EXACT pharmacy name and address
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
    COALESCE(NULLIF(TRIM(NEW.name), ''), 'Main Branch'),
    'branch',
    'MAIN',
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
-- 2. REPAIR CORRUPTED LEGACY ENTRIES
-- ============================================================================
-- Fix any branch rows created during the bug window that were given placeholder values
UPDATE public.shop_locations sl
SET 
  name = CASE 
    WHEN (sl.name = 'Main Branch' OR sl.name LIKE '% - Main Branch') AND NULLIF(TRIM(p.name), '') IS NOT NULL
      THEN TRIM(p.name)
    ELSE sl.name 
  END,
  address = CASE 
    WHEN (sl.address = 'Primary Pharmacy Location' OR sl.address IS NULL OR sl.address = '') AND NULLIF(TRIM(p.address), '') IS NOT NULL
      THEN TRIM(p.address)
    ELSE sl.address 
  END
FROM public.pharmacies p
WHERE sl.pharmacy_id = p.id
  AND (
    sl.name = 'Main Branch' 
    OR sl.name LIKE '% - Main Branch' 
    OR sl.address = 'Primary Pharmacy Location'
  );
