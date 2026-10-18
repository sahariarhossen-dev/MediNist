-- Migration: 20261017090000_fix_branch_and_pharmacy_contact_fields.sql
-- Description:
-- 1. Ensure proprietor_name, phone, and email columns exist on both public.pharmacies and public.shop_locations.
-- 2. Upgrade handle_new_pharmacy_default_location() trigger on public.pharmacies to copy proprietor_name, phone, and email.
-- 3. Upgrade handle_new_user() trigger on auth.users to extract full_name and phone from raw_user_meta_data.
-- 4. Upgrade handle_profile_default_location() trigger on public.profiles to automatically sync owner full_name and phone to main branch and pharmacy.
-- 5. Retroactively backfill existing shop_locations and pharmacies from owner profiles and linked records.

-- ============================================================================
-- 1. ENSURE COLUMNS EXIST ON PHARMACIES AND SHOP_LOCATIONS
-- ============================================================================

ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS proprietor_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.shop_locations
  ADD COLUMN IF NOT EXISTS proprietor_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text;

-- ============================================================================
-- 2. UPGRADE TRIGGER FUNCTION: handle_new_pharmacy_default_location()
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
    -- If the existing branch was created with placeholder 'Main Branch' or missing info, update it now
    UPDATE public.shop_locations
    SET name = COALESCE(v_clean_name, name),
        code = NULL,
        phone = COALESCE(NULLIF(phone, ''), NEW.phone),
        email = COALESCE(NULLIF(email, ''), NEW.email),
        proprietor_name = COALESCE(NULLIF(proprietor_name, ''), NEW.proprietor_name),
        address = COALESCE(NULLIF(address, ''), NEW.address)
    WHERE id = v_main_loc_id;

    -- Link any unassigned profile to the existing branch
    UPDATE public.profiles
    SET assigned_location_id = v_main_loc_id
    WHERE pharmacy_id = NEW.id
      AND assigned_location_id IS NULL;

    RETURN NEW;
  END IF;

  -- Insert primary shop location copying name, address, phone, email, and proprietor_name
  INSERT INTO public.shop_locations (
    pharmacy_id,
    name,
    type,
    code,
    address,
    phone,
    email,
    proprietor_name,
    is_main,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(v_clean_name, 'Pharmacy Outlet'),
    'branch',
    NULL,
    NEW.address,
    NEW.phone,
    NEW.email,
    NEW.proprietor_name,
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

-- Ensure trigger is active on pharmacies
DROP TRIGGER IF EXISTS trg_pharmacy_default_location ON public.pharmacies;
CREATE TRIGGER trg_pharmacy_default_location
  AFTER INSERT ON public.pharmacies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_pharmacy_default_location();

-- ============================================================================
-- 3. UPGRADE TRIGGER FUNCTION: handle_new_user()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    'salesman'
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. UPGRADE TRIGGER FUNCTION: handle_profile_default_location()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_profile_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_loc_id uuid;
BEGIN
  IF NEW.pharmacy_id IS NOT NULL THEN
    SELECT id INTO v_main_loc_id
    FROM public.shop_locations
    WHERE pharmacy_id = NEW.pharmacy_id
      AND is_main = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_main_loc_id IS NOT NULL THEN
      IF NEW.assigned_location_id IS NULL THEN
        NEW.assigned_location_id := v_main_loc_id;
      END IF;

      -- If the profile is owner/admin, synchronize missing contact data to the main branch and pharmacy
      IF NEW.role IN ('owner', 'admin') THEN
        UPDATE public.shop_locations
        SET 
          proprietor_name = COALESCE(NULLIF(proprietor_name, ''), NULLIF(NEW.full_name, '')),
          phone = COALESCE(NULLIF(phone, ''), NULLIF(NEW.phone, ''))
        WHERE id = v_main_loc_id
          AND (proprietor_name IS NULL OR proprietor_name = '' OR phone IS NULL OR phone = '');

        UPDATE public.pharmacies
        SET 
          proprietor_name = COALESCE(NULLIF(proprietor_name, ''), NULLIF(NEW.full_name, '')),
          phone = COALESCE(NULLIF(phone, ''), NULLIF(NEW.phone, ''))
        WHERE id = NEW.pharmacy_id
          AND (proprietor_name IS NULL OR proprietor_name = '' OR phone IS NULL OR phone = '');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_default_location ON public.profiles;
CREATE TRIGGER trg_profile_default_location
  BEFORE INSERT OR UPDATE OF pharmacy_id, assigned_location_id, full_name, phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_default_location();

-- ============================================================================
-- 5. RETROACTIVE BACKFILL FOR EXISTING OUTLETS AND PHARMACIES
-- ============================================================================

-- Backfill public.shop_locations from profiles and parent pharmacies
UPDATE public.shop_locations sl
SET 
  proprietor_name = COALESCE(NULLIF(sl.proprietor_name, ''), NULLIF(p.proprietor_name, ''), NULLIF(prof.full_name, '')),
  phone = COALESCE(NULLIF(sl.phone, ''), NULLIF(p.phone, ''), NULLIF(prof.phone, '')),
  email = COALESCE(NULLIF(sl.email, ''), NULLIF(p.email, ''), NULLIF(u.email, ''))
FROM public.pharmacies p
LEFT JOIN public.profiles prof ON prof.pharmacy_id = p.id AND prof.role IN ('owner', 'admin')
LEFT JOIN auth.users u ON u.id = prof.id
WHERE sl.pharmacy_id = p.id
  AND (
    sl.proprietor_name IS NULL OR sl.proprietor_name = ''
    OR sl.phone IS NULL OR sl.phone = ''
    OR sl.email IS NULL OR sl.email = ''
  );

-- Backfill public.pharmacies from profiles and shop_locations
UPDATE public.pharmacies p
SET 
  proprietor_name = COALESCE(NULLIF(p.proprietor_name, ''), NULLIF(prof.full_name, ''), NULLIF(sl.proprietor_name, '')),
  phone = COALESCE(NULLIF(p.phone, ''), NULLIF(prof.phone, ''), NULLIF(sl.phone, '')),
  email = COALESCE(NULLIF(p.email, ''), NULLIF(u.email, ''), NULLIF(sl.email, ''))
FROM public.profiles prof
LEFT JOIN auth.users u ON u.id = prof.id
LEFT JOIN public.shop_locations sl ON sl.pharmacy_id = prof.pharmacy_id AND sl.is_main = true
WHERE prof.pharmacy_id = p.id
  AND prof.role IN ('owner', 'admin')
  AND (
    p.proprietor_name IS NULL OR p.proprietor_name = ''
    OR p.phone IS NULL OR p.phone = ''
    OR p.email IS NULL OR p.email = ''
  );
