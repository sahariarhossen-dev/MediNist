-- ==============================================================================
-- Migration: Strict Multi-Tenant Isolation for Suppliers & Supplier Ledgers
-- Ensures newly registered pharmacies and existing tenants never leak vendor data
-- ==============================================================================

-- 1. Ensure Table Schema and Columns exist
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms text DEFAULT 'net_30',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0.00,
  balance numeric(14,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz DEFAULT NULL,
  order_days integer[] DEFAULT '{}',
  lead_time_days integer DEFAULT 1,
  minimum_order_amount numeric(12,2) DEFAULT 0.00,
  sr_name text,
  sr_phone text,
  sr_whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure critical columns exist if table already existed
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS balance numeric(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Clean Up Orphaned or Null-Tenant Records (Prevent global leak)
DELETE FROM public.suppliers WHERE pharmacy_id IS NULL;

-- 3. Double-Entry Supplier Ledger Table Schema
CREATE TABLE IF NOT EXISTS public.supplier_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  purchase_order_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('opening_balance', 'bill', 'payment', 'return', 'adjustment')),
  description text,
  debit numeric(14,2) NOT NULL DEFAULT 0.00,
  credit numeric(14,2) NOT NULL DEFAULT 0.00,
  running_balance numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.supplier_ledger_entries ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE CASCADE;
ALTER TABLE public.supplier_ledger_entries ADD COLUMN IF NOT EXISTS location_id uuid;

DELETE FROM public.supplier_ledger_entries WHERE pharmacy_id IS NULL;

-- 4. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

-- 5. Drop all existing loose or conflicting policies on public.suppliers
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "suppliers_select_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_insert_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_update_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_delete_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "Allow authenticated read suppliers" ON public.suppliers;
  DROP POLICY IF EXISTS "Allow all users select suppliers" ON public.suppliers;
  DROP POLICY IF EXISTS "Enable read access for all users" ON public.suppliers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Re-create STRICT Tenant-Isolated Policies on public.suppliers
-- SELECT: Only query suppliers where pharmacy_id strictly matches the authenticated user's pharmacy
CREATE POLICY "suppliers_select_policy" ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- INSERT: Only insert suppliers into the authenticated user's authorized pharmacy
CREATE POLICY "suppliers_insert_policy" ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- UPDATE: Only update suppliers belonging to the authenticated user's authorized pharmacy
CREATE POLICY "suppliers_update_policy" ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- DELETE: Only delete suppliers belonging to the authenticated user's authorized pharmacy
CREATE POLICY "suppliers_delete_policy" ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- 7. Drop and Re-create STRICT Tenant-Isolated Policies on public.supplier_ledger_entries
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "supplier_ledger_select_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_insert_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_update_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_delete_policy" ON public.supplier_ledger_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "supplier_ledger_select_policy" ON public.supplier_ledger_entries
  FOR SELECT
  TO authenticated
  USING (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "supplier_ledger_insert_policy" ON public.supplier_ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "supplier_ledger_update_policy" ON public.supplier_ledger_entries
  FOR UPDATE
  TO authenticated
  USING (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "supplier_ledger_delete_policy" ON public.supplier_ledger_entries
  FOR DELETE
  TO authenticated
  USING (
    pharmacy_id IS NOT NULL
    AND pharmacy_id IN (
      SELECT p.pharmacy_id 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- 8. Composite Performance Indexes for Tenant Isolation
CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy_active_del 
  ON public.suppliers (pharmacy_id, is_active) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy_location 
  ON public.suppliers (pharmacy_id, location_id);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_pharmacy_sup 
  ON public.supplier_ledger_entries (pharmacy_id, supplier_id);
