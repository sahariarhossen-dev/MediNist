-- Migration: 20260920140000_parent_child_location_architecture_backfill.sql
-- Description: Transition MediNist to Parent-Child (Mother Tenant -> Shop Locations) architecture:
-- 1. Add location_id to operational tables (sales, cash_transactions, daily_closings, customer_ledger, medicines)
-- 2. Ensure every pharmacy has a designated main shop_location
-- 3. Backfill all legacy records with NULL location_id to the pharmacy's main location
-- 4. Create performance indexes

-- ============================================================================
-- 1. ADD location_id FOREIGN KEY COLUMNS
-- ============================================================================

-- 1a. Ensure shop_locations table exists (safety check)
CREATE TABLE IF NOT EXISTS public.shop_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('shop', 'godown')),
  address text,
  is_active boolean NOT NULL DEFAULT true,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1b. Add location_id to public.sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL;

-- 1c. Add location_id to public.cash_transactions
ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL;

-- 1d. Add location_id to public.daily_closings
ALTER TABLE public.daily_closings
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL;

-- 1e. Add location_id to public.customer_ledger
ALTER TABLE public.customer_ledger
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL;

-- 1f. Ensure location_id exists on public.medicines
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. ENSURE EVERY EXISTING PHARMACY HAS A MAIN LOCATION
-- ============================================================================
DO $$
DECLARE
  p RECORD;
  v_main_location_id uuid;
BEGIN
  FOR p IN SELECT id, name FROM public.pharmacies LOOP
    -- Step A: Check if a location with is_main = true already exists for this pharmacy
    SELECT id INTO v_main_location_id
    FROM public.shop_locations
    WHERE pharmacy_id = p.id AND is_main = true
    ORDER BY created_at ASC
    LIMIT 1;

    -- Step B: If no location is marked main, but locations exist, promote the earliest one
    IF v_main_location_id IS NULL THEN
      SELECT id INTO v_main_location_id
      FROM public.shop_locations
      WHERE pharmacy_id = p.id
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_main_location_id IS NOT NULL THEN
        UPDATE public.shop_locations
        SET is_main = true,
            updated_at = now()
        WHERE id = v_main_location_id;
      END IF;
    END IF;

    -- Step C: If no locations exist at all for this pharmacy, insert a default main branch
    IF v_main_location_id IS NULL THEN
      INSERT INTO public.shop_locations (
        pharmacy_id,
        name,
        type,
        is_main,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        p.id,
        COALESCE(NULLIF(TRIM(p.name), ''), 'Main Pharmacy') || ' - Main Branch',
        'shop',
        true,
        true,
        now(),
        now()
      )
      RETURNING id INTO v_main_location_id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 3. BACKFILL LEGACY RECORDS (ZERO DATA LOSS)
-- ============================================================================

-- 3a. Backfill public.sales
UPDATE public.sales s
SET location_id = (
  SELECT l.id
  FROM public.shop_locations l
  WHERE l.pharmacy_id = s.pharmacy_id
    AND l.is_main = true
  ORDER BY l.created_at ASC
  LIMIT 1
)
WHERE s.location_id IS NULL
  AND s.pharmacy_id IS NOT NULL;

-- 3b. Backfill public.cash_transactions
UPDATE public.cash_transactions ct
SET location_id = (
  SELECT l.id
  FROM public.shop_locations l
  WHERE l.pharmacy_id = ct.pharmacy_id
    AND l.is_main = true
  ORDER BY l.created_at ASC
  LIMIT 1
)
WHERE ct.location_id IS NULL
  AND ct.pharmacy_id IS NOT NULL;

-- 3c. Backfill public.daily_closings
UPDATE public.daily_closings dc
SET location_id = (
  SELECT l.id
  FROM public.shop_locations l
  WHERE l.pharmacy_id = dc.pharmacy_id
    AND l.is_main = true
  ORDER BY l.created_at ASC
  LIMIT 1
)
WHERE dc.location_id IS NULL
  AND dc.pharmacy_id IS NOT NULL;

-- 3d. Backfill public.customer_ledger
UPDATE public.customer_ledger cl
SET location_id = (
  SELECT l.id
  FROM public.shop_locations l
  WHERE l.pharmacy_id = cl.pharmacy_id
    AND l.is_main = true
  ORDER BY l.created_at ASC
  LIMIT 1
)
WHERE cl.location_id IS NULL
  AND cl.pharmacy_id IS NOT NULL;

-- 3e. Backfill public.medicines
UPDATE public.medicines m
SET location_id = (
  SELECT l.id
  FROM public.shop_locations l
  WHERE l.pharmacy_id = m.pharmacy_id
    AND l.is_main = true
  ORDER BY l.created_at ASC
  LIMIT 1
)
WHERE m.location_id IS NULL
  AND m.pharmacy_id IS NOT NULL;

-- ============================================================================
-- 4. ADD INDEXES FOR HIGH PERFORMANCE QUERYING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sales_location_id 
  ON public.sales(location_id);

CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_location 
  ON public.sales(pharmacy_id, location_id);

CREATE INDEX IF NOT EXISTS idx_medicines_location_id 
  ON public.medicines(location_id);

CREATE INDEX IF NOT EXISTS idx_medicines_pharmacy_location 
  ON public.medicines(pharmacy_id, location_id);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_location_id 
  ON public.cash_transactions(location_id);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_pharmacy_location 
  ON public.cash_transactions(pharmacy_id, location_id);

CREATE INDEX IF NOT EXISTS idx_daily_closings_location_id 
  ON public.daily_closings(location_id);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_location_id 
  ON public.customer_ledger(location_id);

CREATE INDEX IF NOT EXISTS idx_shop_locations_pharmacy_main 
  ON public.shop_locations(pharmacy_id, is_main);
