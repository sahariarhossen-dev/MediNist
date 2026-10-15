-- ==============================================================================
-- MEDINIST MIGRATION: STRICT 1:1 MULTI-BRANCH SUPPLIER ISOLATION
-- ==============================================================================

-- 1. COLUMN ADDITION & FOREIGN KEY
-- Ensure column public.suppliers.location_id exists as UUID
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS location_id uuid;

-- Safely drop existing foreign key constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_location_id_fkey'
  ) THEN
    ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_location_id_fkey;
  END IF;
END $$;

-- Add foreign key constraint with ON DELETE RESTRICT to prevent orphan supplier records
ALTER TABLE public.suppliers 
ADD CONSTRAINT suppliers_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES public.shop_locations(id) ON DELETE RESTRICT;

-- Ensure location_id exists on supplier_ledger_entries as well
ALTER TABLE public.supplier_ledger_entries 
ADD COLUMN IF NOT EXISTS location_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_ledger_location_id_fkey'
  ) THEN
    ALTER TABLE public.supplier_ledger_entries DROP CONSTRAINT supplier_ledger_location_id_fkey;
  END IF;
END $$;

ALTER TABLE public.supplier_ledger_entries 
ADD CONSTRAINT supplier_ledger_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES public.shop_locations(id) ON DELETE RESTRICT;

-- 2. AUTOMATED BACKFILL OF LEGACY DATA
-- Backfill suppliers where location_id IS NULL to the designated main/primary branch of that pharmacy
UPDATE public.suppliers s
SET location_id = sub.id
FROM (
  SELECT DISTINCT ON (sl.pharmacy_id) sl.pharmacy_id, sl.id
  FROM public.shop_locations sl
  ORDER BY sl.pharmacy_id, sl.is_main DESC, sl.created_at ASC
) sub
WHERE s.pharmacy_id = sub.pharmacy_id 
  AND s.location_id IS NULL;

-- Backfill unassigned supplier ledger entries to match their parent supplier's location_id
UPDATE public.supplier_ledger_entries sle
SET location_id = s.location_id
FROM public.suppliers s
WHERE sle.supplier_id = s.id 
  AND sle.location_id IS NULL;

-- Fallback for any orphaned ledger entries without a linked supplier
UPDATE public.supplier_ledger_entries sle
SET location_id = sub.id
FROM (
  SELECT DISTINCT ON (sl.pharmacy_id) sl.pharmacy_id, sl.id
  FROM public.shop_locations sl
  ORDER BY sl.pharmacy_id, sl.is_main DESC, sl.created_at ASC
) sub
WHERE sle.pharmacy_id = sub.pharmacy_id 
  AND sle.location_id IS NULL;

-- 3. PERFORMANCE COMPOSITE INDEXES
DROP INDEX IF EXISTS public.idx_suppliers_pharmacy_location;
CREATE INDEX idx_suppliers_pharmacy_location 
ON public.suppliers (pharmacy_id, location_id) 
WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.idx_supplier_ledger_branch;
CREATE INDEX idx_supplier_ledger_branch 
ON public.supplier_ledger_entries (pharmacy_id, location_id);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES ON public.suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "suppliers_select_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_insert_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_update_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_delete_policy" ON public.suppliers;
END $$;

-- SELECT Policy: User's profile pharmacy_id must match suppliers.pharmacy_id
CREATE POLICY "suppliers_select_policy" ON public.suppliers
  FOR SELECT
  USING (
    pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- INSERT Policy: User's profile pharmacy_id matches AND location_id must belong to that same pharmacy
CREATE POLICY "suppliers_insert_policy" ON public.suppliers
  FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
    AND (
      location_id IS NULL
      OR location_id IN (
        SELECT sl.id 
        FROM public.shop_locations sl 
        WHERE sl.pharmacy_id = public.suppliers.pharmacy_id
      )
    )
  );

-- UPDATE Policy: Scoped strictly to user's profile pharmacy_id
CREATE POLICY "suppliers_update_policy" ON public.suppliers
  FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
    AND (
      location_id IS NULL
      OR location_id IN (
        SELECT sl.id 
        FROM public.shop_locations sl 
        WHERE sl.pharmacy_id = public.suppliers.pharmacy_id
      )
    )
  );

-- DELETE Policy: Scoped strictly to user's profile pharmacy_id
CREATE POLICY "suppliers_delete_policy" ON public.suppliers
  FOR DELETE
  USING (
    pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );
