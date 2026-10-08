-- ==============================================================================
-- Migration: Normalize Manufacturers & Suppliers (Approach C: Enterprise Hybrid)
-- Version: 20261007073000
-- System: MediNist Multi-Tenant Pharmacy Management & POS
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. CENTRAL MASTER TABLE: manufacturers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_manufacturers_name UNIQUE (name)
);

-- Case-insensitive index to prevent duplicates like "Square" vs "square"
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturers_name_lower 
    ON public.manufacturers (LOWER(TRIM(name)));

-- ------------------------------------------------------------------------------
-- 2. TENANT JUNCTION TABLE: supplier_manufacturers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    manufacturer_id UUID NOT NULL REFERENCES public.manufacturers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_supplier_manufacturers UNIQUE (supplier_id, manufacturer_id)
);

-- ------------------------------------------------------------------------------
-- 3. ALTER medicines TABLE: Add manufacturer_id FK
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'medicines' 
          AND column_name = 'manufacturer_id'
    ) THEN
        ALTER TABLE public.medicines 
        ADD COLUMN manufacturer_id UUID REFERENCES public.manufacturers(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE B-TREE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_medicines_manufacturer_id 
    ON public.medicines(manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_supplier_manufacturers_supplier_id 
    ON public.supplier_manufacturers(supplier_id);

CREATE INDEX IF NOT EXISTS idx_supplier_manufacturers_manufacturer_id 
    ON public.supplier_manufacturers(manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_supplier_manufacturers_pharmacy_id 
    ON public.supplier_manufacturers(pharmacy_id);

-- Composite index for fast shortage planner joins:
CREATE INDEX IF NOT EXISTS idx_supplier_manufacturers_lookup 
    ON public.supplier_manufacturers(supplier_id, manufacturer_id, pharmacy_id);

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
-- 5.1 manufacturers RLS
ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "manufacturers_select_policy" ON public.manufacturers;
    DROP POLICY IF EXISTS "manufacturers_insert_policy" ON public.manufacturers;
    DROP POLICY IF EXISTS "manufacturers_update_policy" ON public.manufacturers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Any authenticated user can browse the verified manufacturers catalog
CREATE POLICY "manufacturers_select_policy" ON public.manufacturers
    FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated staff can register new manufacturers if not yet in master catalog
CREATE POLICY "manufacturers_insert_policy" ON public.manufacturers
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "manufacturers_update_policy" ON public.manufacturers
    FOR UPDATE
    TO authenticated
    USING (auth.role() = 'authenticated');

-- 5.2 supplier_manufacturers RLS (Strict Multi-Tenant Isolation)
ALTER TABLE public.supplier_manufacturers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "supplier_manufacturers_select_policy" ON public.supplier_manufacturers;
    DROP POLICY IF EXISTS "supplier_manufacturers_insert_policy" ON public.supplier_manufacturers;
    DROP POLICY IF EXISTS "supplier_manufacturers_update_policy" ON public.supplier_manufacturers;
    DROP POLICY IF EXISTS "supplier_manufacturers_delete_policy" ON public.supplier_manufacturers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "supplier_manufacturers_select_policy" ON public.supplier_manufacturers
    FOR SELECT
    TO authenticated
    USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_manufacturers_insert_policy" ON public.supplier_manufacturers
    FOR INSERT
    TO authenticated
    WITH CHECK (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_manufacturers_update_policy" ON public.supplier_manufacturers
    FOR UPDATE
    TO authenticated
    USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_manufacturers_delete_policy" ON public.supplier_manufacturers
    FOR DELETE
    TO authenticated
    USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 6. DATA BACKFILL & IDEMPOTENT MIGRATION
-- ------------------------------------------------------------------------------

-- Step 6.1: Harvest DISTINCT non-empty company_name strings from medicines
INSERT INTO public.manufacturers (name, is_active)
SELECT DISTINCT TRIM(company_name) AS name, true
FROM public.medicines
WHERE company_name IS NOT NULL 
  AND TRIM(company_name) <> ''
ON CONFLICT (name) DO NOTHING;

-- Step 6.2: Link existing medicines to their corresponding manufacturer_id
UPDATE public.medicines m
SET manufacturer_id = mf.id
FROM public.manufacturers mf
WHERE m.manufacturer_id IS NULL
  AND m.company_name IS NOT NULL
  AND LOWER(TRIM(m.company_name)) = LOWER(TRIM(mf.name));

-- Step 6.3: Auto-associate existing suppliers with manufacturers via loose name heuristic
INSERT INTO public.supplier_manufacturers (pharmacy_id, supplier_id, manufacturer_id)
SELECT DISTINCT 
    s.pharmacy_id,
    s.id AS supplier_id,
    mf.id AS manufacturer_id
FROM public.suppliers s
JOIN public.manufacturers mf 
  ON (
     LOWER(TRIM(s.name)) = LOWER(TRIM(mf.name))
     OR s.name ILIKE '%' || mf.name || '%'
     OR mf.name ILIKE '%' || s.name || '%'
  )
WHERE s.deleted_at IS NULL
ON CONFLICT (supplier_id, manufacturer_id) DO NOTHING;

COMMIT;
