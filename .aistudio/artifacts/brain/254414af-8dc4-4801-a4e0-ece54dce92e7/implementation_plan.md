# Revised Implementation Plan: Dynamic Brand-Aligned Default Branch Provisioning & UI Purification

## Executive Summary
This revised plan strictly incorporates the 3 mandatory business requirements for MediNist:
1. **Zero "Main Branch" or `(MAIN)` Badges in the UI**: Complete removal of any `(MAIN)`, `(Branch)`, or `(Headquarters / Main Branch)` badges or title suffixes. All cards, switchers, and headers display ONLY the clean, genuine pharmacy brand name.
2. **Trigger Code Hardcoding Fix**: Update the PostgreSQL trigger `handle_new_pharmacy_default_location()` so that `code` is set to `NULL` (rather than `'MAIN'`), and backfill legacy `shop_locations` to clear legacy `'MAIN'` codes.
3. **Invoice & Receipt Template Alignment**: In `/invoice/...` (`src/pages/Invoice.tsx`), bind the header shop profile directly to `shop_locations.name` (falling back to `pharmacies.name`), with hierarchical fallback for proprietor name, mobile/phone, email, and physical address.

---

## 1. Technical Deliverables Specification

### Deliverable 1: Complete SQL Migration Script
**Target:** `supabase/migrations/20261015000000_dynamic_default_branch_and_rename_legacy.sql`

```sql
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
```

---

### Deliverable 2: Frontend Context & Edge Function Code Updates

1. **`src/contexts/LocationContext.tsx`**:
   - In dynamic bootstrap fallback (lines 119–144), replace `"Main Branch"` with `pharmacyRecord?.name?.trim() || "Pharmacy Outlet"`.
   - Set `code: null` instead of `"MAIN"`.
   - Update `EMPTY_FALLBACK_LOCATION` to `name: "Pharmacy"`.

2. **`supabase/functions/create-demo-session/index.ts`**:
   - Rely directly on the database trigger when inserting `pharmacies`, ensuring the created location inherits the exact demo pharmacy brand name with `code: null`.

3. **`src/components/profile/ActiveBranchCard.tsx`**:
   - Strictly remove `const branchCodeText = ...`.
   - Display ONLY `const branchDisplayName = activeLocation.name || "Pharmacy";`.
   - Remove any `(MAIN)` or `(Branch)` badge rendering in the card header and trigger button.
   - Show only clean brand title, store/warehouse icon, and location type badge.

4. **`src/pages/Locations.tsx`**:
   - Remove any "Headquarters / Main Branch" badges.
   - For currently active branch, retain only a clean `Active` badge.
   - Ensure primary branch without code displays clean title without code pill.

5. **`src/components/dashboard/ShopDashboard.tsx`**:
   - Replace `{activeLocation.name || "Main Branch"} Overview` with `{activeLocation.name || "Pharmacy"} Overview`.

---

### Deliverable 3: Invoice & Receipt Template Alignment (`src/pages/Invoice.tsx`)

In `src/pages/Invoice.tsx`:
1. **Cascade Resolution**:
   - Query `public.shop_locations` by `typedSale.location_id` (or fallback to `pharmacy_id` with `is_main = true`).
   - Concurrently query `public.pharmacies` by `typedSale.pharmacy_id` to get master brand information (`name`, `proprietor_name`, `phone`, `email`, `address`).
2. **Shop Profile Binding**:
   - **Shop Name**: `(locData?.name && locData.name !== 'Main Branch' ? locData.name : pharmData?.name) || 'Pharmacy'`.
   - **Proprietor**: `locData?.proprietor_name || pharmData?.proprietor_name || "N/A"`.
   - **Mobile**: `locData?.phone || pharmData?.phone || sellerPhone || profile?.phone || "N/A"`.
   - **Address**: `locData?.address || pharmData?.address || "N/A"`.
   - **Email**: `locData?.email || pharmData?.email || "N/A"`.
3. **Template Header**:
   - Render clean pharmacy name in `<h1 className="text-lg font-extrabold text-gray-900 tracking-tight whitespace-nowrap truncate">{branch.name}</h1>`.
   - Render proprietor, mobile, address, and email with zero hardcoded "Main Branch" strings.

---

## 2. Verification Plan

1. **Compilation Check**: Run `compile_applet` to verify TypeScript compile integrity across all modified files.
2. **Text Search Verification**: Run global regex search `grep -rn "Main Branch" src/` to ensure zero instances exist in UI components.
3. **Invoice Header Verification**: Inspect the invoice preview to confirm the header displays the pharmacy brand name and proprietor info dynamically.
