-- ==============================================================================
-- Migration: Isolate Suppliers & Supplier Ledger by Branch Location (Self-Healing)
-- Incident ID: PO-DATA-ISO-01 (Step 1)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. PREREQUISITES: Ensure extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. BASELINE TABLE: public.shop_locations (Guaranteed schema & columns)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'shop',
  code text,
  address text DEFAULT '',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure critical columns exist on shop_locations if table pre-existed from earlier migrations
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'shop';
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.shop_locations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure at least one location is designated as is_main = true per pharmacy
DO $$
BEGIN
  UPDATE public.shop_locations
  SET is_main = true
  WHERE id IN (
    SELECT DISTINCT ON (pharmacy_id) id
    FROM public.shop_locations
    WHERE pharmacy_id NOT IN (
      SELECT pharmacy_id FROM public.shop_locations WHERE is_main = true
    )
    ORDER BY pharmacy_id, created_at ASC
  );
END $$;

-- ------------------------------------------------------------------------------
-- 2. BASELINE TABLE: public.suppliers (Guaranteed schema & location_id)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
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

-- Ensure location_id and all extended columns exist on suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS balance numeric(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'net_30';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS order_days integer[] DEFAULT '{}';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 1;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS minimum_order_amount numeric(12,2) DEFAULT 0.00;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sr_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sr_phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sr_whatsapp text;

-- Safely add foreign key constraint if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_location_id_fkey'
  ) THEN
    ALTER TABLE public.suppliers 
    ADD CONSTRAINT suppliers_location_id_fkey 
    FOREIGN KEY (location_id) REFERENCES public.shop_locations(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 3. BASELINE TABLE: public.supplier_ledger_entries (Double-Entry Ledger)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  location_id uuid,
  purchase_order_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('opening_balance', 'bill', 'payment', 'return', 'adjustment')),
  description text,
  debit numeric(14,2) NOT NULL DEFAULT 0.00,
  credit numeric(14,2) NOT NULL DEFAULT 0.00,
  running_balance numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Ensure location_id exists if table already existed
ALTER TABLE public.supplier_ledger_entries ADD COLUMN IF NOT EXISTS location_id uuid;

-- Safely add foreign key to shop_locations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_ledger_location_id_fkey'
  ) THEN
    ALTER TABLE public.supplier_ledger_entries 
    ADD CONSTRAINT supplier_ledger_location_id_fkey 
    FOREIGN KEY (location_id) REFERENCES public.shop_locations(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Enable RLS for supplier_ledger_entries safely
ALTER TABLE public.supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "supplier_ledger_select_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_insert_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_update_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_delete_policy" ON public.supplier_ledger_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "supplier_ledger_select_policy" ON public.supplier_ledger_entries
  FOR SELECT USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_ledger_insert_policy" ON public.supplier_ledger_entries
  FOR INSERT WITH CHECK (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_ledger_update_policy" ON public.supplier_ledger_entries
  FOR UPDATE USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "supplier_ledger_delete_policy" ON public.supplier_ledger_entries
  FOR DELETE USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 4. SAFE LEGACY DATA BACKFILL: Assign to Main Branch
-- ------------------------------------------------------------------------------
-- Backfill suppliers to primary/main branch of each pharmacy
UPDATE public.suppliers s
SET location_id = (
  SELECT sl.id FROM public.shop_locations sl 
  WHERE sl.pharmacy_id = s.pharmacy_id 
  ORDER BY sl.is_main DESC, sl.created_at ASC 
  LIMIT 1
)
WHERE s.location_id IS NULL;

-- Backfill supplier ledger entries to match their supplier's branch
UPDATE public.supplier_ledger_entries sle
SET location_id = (
  SELECT s.location_id FROM public.suppliers s 
  WHERE s.id = sle.supplier_id
)
WHERE sle.location_id IS NULL;

-- Fallback for any orphaned ledger entries without a linked supplier
UPDATE public.supplier_ledger_entries sle
SET location_id = (
  SELECT sl.id FROM public.shop_locations sl 
  WHERE sl.pharmacy_id = sle.pharmacy_id 
  ORDER BY sl.is_main DESC, sl.created_at ASC 
  LIMIT 1
)
WHERE sle.location_id IS NULL;

-- ------------------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy_location 
ON public.suppliers (pharmacy_id, location_id);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_pharmacy_location 
ON public.supplier_ledger_entries (pharmacy_id, location_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_location_active 
ON public.suppliers (location_id, is_active);
