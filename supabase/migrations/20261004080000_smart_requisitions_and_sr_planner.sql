-- ==============================================================================
-- Migration: Smart Requisitions & SR Order Planner System (With Auto-Provisioning)
-- Version: 20261004080000
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. BASELINE TABLE CREATION: suppliers (Auto-Provisioned if missing)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms text DEFAULT 'net_30' CHECK (payment_terms IN ('cash', 'net_15', 'net_30', 'net_60', 'credit', 'advance')),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0.00,
  balance numeric(14,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz DEFAULT NULL,
  order_days integer[] DEFAULT '{}', -- 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
  lead_time_days integer DEFAULT 1,
  minimum_order_amount numeric(12,2) DEFAULT 0.00,
  sr_name text,
  sr_phone text,
  sr_whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all extended columns exist on suppliers (in case table already existed partially)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'order_days') THEN
    ALTER TABLE public.suppliers ADD COLUMN order_days integer[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'lead_time_days') THEN
    ALTER TABLE public.suppliers ADD COLUMN lead_time_days integer DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'minimum_order_amount') THEN
    ALTER TABLE public.suppliers ADD COLUMN minimum_order_amount numeric(12,2) DEFAULT 0.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'sr_name') THEN
    ALTER TABLE public.suppliers ADD COLUMN sr_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'sr_phone') THEN
    ALTER TABLE public.suppliers ADD COLUMN sr_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'sr_whatsapp') THEN
    ALTER TABLE public.suppliers ADD COLUMN sr_whatsapp text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'opening_balance') THEN
    ALTER TABLE public.suppliers ADD COLUMN opening_balance numeric(14,2) NOT NULL DEFAULT 0.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'balance') THEN
    ALTER TABLE public.suppliers ADD COLUMN balance numeric(14,2) NOT NULL DEFAULT 0.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.suppliers ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy_active 
  ON public.suppliers(pharmacy_id, is_active) 
  WHERE deleted_at IS NULL;

-- Enable RLS for suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "suppliers_select_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_insert_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_update_policy" ON public.suppliers;
  DROP POLICY IF EXISTS "suppliers_delete_policy" ON public.suppliers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "suppliers_select_policy" ON public.suppliers
  FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "suppliers_insert_policy" ON public.suppliers
  FOR INSERT
  WITH CHECK (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "suppliers_update_policy" ON public.suppliers
  FOR UPDATE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "suppliers_delete_policy" ON public.suppliers
  FOR DELETE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 2. BASELINE TABLE CREATION: purchase_orders (Auto-Provisioned if missing)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  location_id uuid,
  warehouse_id uuid,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  total_amount numeric(14,2) NOT NULL DEFAULT 0.00,
  invoice_discount numeric(14,2) DEFAULT 0.00,
  vat_amount numeric(14,2) DEFAULT 0.00,
  notes text,
  order_date date DEFAULT CURRENT_DATE,
  expected_date date,
  received_at timestamptz,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "purchase_orders_select_policy" ON public.purchase_orders;
  DROP POLICY IF EXISTS "purchase_orders_insert_policy" ON public.purchase_orders;
  DROP POLICY IF EXISTS "purchase_orders_update_policy" ON public.purchase_orders;
  DROP POLICY IF EXISTS "purchase_orders_delete_policy" ON public.purchase_orders;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "purchase_orders_select_policy" ON public.purchase_orders
  FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "purchase_orders_insert_policy" ON public.purchase_orders
  FOR INSERT
  WITH CHECK (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "purchase_orders_update_policy" ON public.purchase_orders
  FOR UPDATE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "purchase_orders_delete_policy" ON public.purchase_orders
  FOR DELETE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 3. EXTEND TABLE: medicines (Reorder level, Target capacity, Preferred supplier)
-- ------------------------------------------------------------------------------
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'medicines' AND column_name = 'reorder_level'
  ) THEN
    ALTER TABLE public.medicines ADD COLUMN reorder_level integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'medicines' AND column_name = 'target_stock'
  ) THEN
    ALTER TABLE public.medicines ADD COLUMN target_stock integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'medicines' AND column_name = 'preferred_supplier_id'
  ) THEN
    ALTER TABLE public.medicines ADD COLUMN preferred_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_medicines_reorder_supplier 
  ON public.medicines(pharmacy_id, location_id, preferred_supplier_id);

CREATE INDEX IF NOT EXISTS idx_medicines_reorder_calc 
  ON public.medicines(pharmacy_id, location_id, stock_quantity, reorder_level, stock_alert);

-- ------------------------------------------------------------------------------
-- 4. CREATE NEW TABLE: requisitions
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  location_id uuid,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  requisition_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'shared', 'confirmed', 'converted_to_po', 'cancelled')) DEFAULT 'draft',
  scheduled_order_day integer,
  total_estimated_amount numeric(14,2) DEFAULT 0.00,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisitions_pharmacy_status 
  ON public.requisitions(pharmacy_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requisitions_supplier 
  ON public.requisitions(supplier_id, created_at DESC);

ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "requisitions_select_policy" ON public.requisitions;
  DROP POLICY IF EXISTS "requisitions_insert_policy" ON public.requisitions;
  DROP POLICY IF EXISTS "requisitions_update_policy" ON public.requisitions;
  DROP POLICY IF EXISTS "requisitions_delete_policy" ON public.requisitions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "requisitions_select_policy" ON public.requisitions
  FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "requisitions_insert_policy" ON public.requisitions
  FOR INSERT
  WITH CHECK (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "requisitions_update_policy" ON public.requisitions
  FOR UPDATE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "requisitions_delete_policy" ON public.requisitions
  FOR DELETE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. CREATE NEW TABLE: requisition_items
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  medicine_id uuid REFERENCES public.medicines(id) ON DELETE SET NULL,
  medicine_name text NOT NULL,
  generic_name text,
  company_name text,
  current_stock_pcs integer NOT NULL DEFAULT 0,
  reorder_level_pcs integer NOT NULL DEFAULT 0,
  suggested_qty_pcs integer NOT NULL DEFAULT 0,
  final_order_qty_pcs integer NOT NULL DEFAULT 0,
  pack_mode text DEFAULT 'box' CHECK (pack_mode IN ('box', 'strip', 'piece')),
  boxes_to_order integer DEFAULT 0,
  strips_to_order integer DEFAULT 0,
  pieces_per_box integer DEFAULT 1,
  pcs_per_strip integer DEFAULT 1,
  strip_per_pack integer DEFAULT 1,
  estimated_trade_price numeric(12,2) DEFAULT 0.00,
  estimated_line_total numeric(12,2) DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisition_items_req 
  ON public.requisition_items(requisition_id);

CREATE INDEX IF NOT EXISTS idx_requisition_items_med 
  ON public.requisition_items(medicine_id);

ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "requisition_items_select_policy" ON public.requisition_items;
  DROP POLICY IF EXISTS "requisition_items_insert_policy" ON public.requisition_items;
  DROP POLICY IF EXISTS "requisition_items_update_policy" ON public.requisition_items;
  DROP POLICY IF EXISTS "requisition_items_delete_policy" ON public.requisition_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "requisition_items_select_policy" ON public.requisition_items
  FOR SELECT
  USING (
    requisition_id IN (
      SELECT id FROM public.requisitions 
      WHERE pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "requisition_items_insert_policy" ON public.requisition_items
  FOR INSERT
  WITH CHECK (
    requisition_id IN (
      SELECT id FROM public.requisitions 
      WHERE pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "requisition_items_update_policy" ON public.requisition_items
  FOR UPDATE
  USING (
    requisition_id IN (
      SELECT id FROM public.requisitions 
      WHERE pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "requisition_items_delete_policy" ON public.requisition_items
  FOR DELETE
  USING (
    requisition_id IN (
      SELECT id FROM public.requisitions 
      WHERE pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 6. CREATE NEW TABLE: requisition_magic_links (The SR Public Portal Tokens)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requisition_magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL,
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  is_revoked boolean NOT NULL DEFAULT false,
  sr_acknowledged_at timestamptz,
  sr_estimated_delivery timestamptz,
  sr_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token 
  ON public.requisition_magic_links(token) 
  WHERE is_revoked IS FALSE;

CREATE INDEX IF NOT EXISTS idx_magic_links_pharmacy 
  ON public.requisition_magic_links(pharmacy_id, created_at DESC);

ALTER TABLE public.requisition_magic_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "magic_links_select_policy" ON public.requisition_magic_links;
  DROP POLICY IF EXISTS "magic_links_insert_policy" ON public.requisition_magic_links;
  DROP POLICY IF EXISTS "magic_links_update_policy" ON public.requisition_magic_links;
  DROP POLICY IF EXISTS "magic_links_delete_policy" ON public.requisition_magic_links;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "magic_links_select_policy" ON public.requisition_magic_links
  FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "magic_links_insert_policy" ON public.requisition_magic_links
  FOR INSERT
  WITH CHECK (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "magic_links_update_policy" ON public.requisition_magic_links
  FOR UPDATE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "magic_links_delete_policy" ON public.requisition_magic_links
  FOR DELETE
  USING (pharmacy_id IN (SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()));

-- ------------------------------------------------------------------------------
-- 7. RPC 1: get_smart_requisition_suggestions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_smart_requisition_suggestions(
  _pharmacy_id uuid,
  _location_id uuid DEFAULT NULL,
  _day_of_week integer DEFAULT NULL -- 0=Sun, 1=Mon, ..., 6=Sat
)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  sr_name text,
  sr_phone text,
  sr_whatsapp text,
  order_days integer[],
  is_scheduled_today boolean,
  short_items_count bigint,
  total_estimated_value numeric,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_suppliers AS (
    SELECT 
      s.id,
      s.name,
      s.sr_name,
      s.sr_phone,
      s.sr_whatsapp,
      s.order_days,
      (_day_of_week IS NULL OR _day_of_week = ANY(s.order_days)) AS is_today
    FROM public.suppliers s
    WHERE s.pharmacy_id = _pharmacy_id
      AND s.is_active = TRUE
      AND s.deleted_at IS NULL
  ),
  short_medicines AS (
    SELECT 
      m.id AS medicine_id,
      m.name AS medicine_name,
      m.generic_name,
      m.company_name,
      COALESCE(m.preferred_supplier_id, es.id) AS matched_supplier_id,
      COALESCE(m.stock_quantity, 0) AS current_stock,
      COALESCE(m.reorder_level, m.stock_alert, 10) AS threshold,
      COALESCE(m.target_stock, 50) AS target_capacity,
      COALESCE(m.strip_per_pack, 1) AS spp,
      COALESCE(m.pcs_per_strip, 1) AS pps,
      COALESCE(m.price * 0.88, 10.00) AS estimated_tp
    FROM public.medicines m
    LEFT JOIN eligible_suppliers es 
      ON m.preferred_supplier_id = es.id 
      OR (m.preferred_supplier_id IS NULL AND es.name ILIKE ('%' || m.company_name || '%'))
    WHERE m.pharmacy_id = _pharmacy_id
      AND (_location_id IS NULL OR m.location_id = _location_id)
      AND COALESCE(m.stock_quantity, 0) <= COALESCE(m.reorder_level, m.stock_alert, 10)
  )
  SELECT 
    es.id AS supplier_id,
    es.name AS supplier_name,
    es.sr_name,
    es.sr_phone,
    es.sr_whatsapp,
    es.order_days,
    es.is_today AS is_scheduled_today,
    COUNT(sm.medicine_id)::bigint AS short_items_count,
    COALESCE(SUM(
      GREATEST(sm.target_capacity - sm.current_stock, sm.spp * sm.pps) * sm.estimated_tp
    ), 0.00)::numeric AS total_estimated_value,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'medicine_id', sm.medicine_id,
        'medicine_name', sm.medicine_name,
        'generic_name', sm.generic_name,
        'company_name', sm.company_name,
        'current_stock_pcs', sm.current_stock,
        'reorder_level_pcs', sm.threshold,
        'suggested_qty_pcs', GREATEST(sm.target_capacity - sm.current_stock, sm.spp * sm.pps),
        'strip_per_pack', sm.spp,
        'pcs_per_strip', sm.pps,
        'pieces_per_box', (sm.spp * sm.pps),
        'estimated_tp', sm.estimated_tp
      )
    ) FILTER (WHERE sm.medicine_id IS NOT NULL), '[]'::jsonb) AS items
  FROM eligible_suppliers es
  LEFT JOIN short_medicines sm ON sm.matched_supplier_id = es.id
  GROUP BY es.id, es.name, es.sr_name, es.sr_phone, es.sr_whatsapp, es.order_days, es.is_today
  HAVING COUNT(sm.medicine_id) > 0 OR es.is_today = TRUE
  ORDER BY es.is_today DESC, short_items_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_smart_requisition_suggestions(uuid, uuid, integer) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. RPC 2: get_public_sr_order_portal (Safe Public Access for Field Reps)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_sr_order_portal(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _link record;
  _pharmacy record;
  _supplier record;
  _requisition record;
  _items jsonb;
BEGIN
  -- 1. Validate Token and Expiry
  SELECT * INTO _link 
  FROM public.requisition_magic_links
  WHERE token = _token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid order link.');
  END IF;

  IF _link.is_revoked THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This order link has been revoked by the pharmacy.');
  END IF;

  IF _link.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This order link expired on ' || to_char(_link.expires_at, 'YYYY-MM-DD HH24:MI') || '. Please request an updated link.');
  END IF;

  -- 2. Increment Access Telemetry
  UPDATE public.requisition_magic_links
  SET access_count = access_count + 1,
      last_accessed_at = now()
  WHERE id = _link.id;

  -- 3. Fetch Pharmacy & Supplier Brand Context
  SELECT name, phone, address INTO _pharmacy 
  FROM public.pharmacies WHERE id = _link.pharmacy_id;

  SELECT name, sr_name, sr_phone INTO _supplier 
  FROM public.suppliers WHERE id = _link.supplier_id;

  SELECT requisition_number, status, notes, total_estimated_amount, created_at INTO _requisition
  FROM public.requisitions WHERE id = _link.requisition_id;

  -- 4. Aggregate Sanitized Order Items (No profit margins or cost leaks)
  SELECT jsonb_agg(
    jsonb_build_object(
      'medicine_name', ri.medicine_name,
      'generic_name', ri.generic_name,
      'company_name', ri.company_name,
      'pack_mode', ri.pack_mode,
      'boxes_to_order', ri.boxes_to_order,
      'strips_to_order', ri.strips_to_order,
      'final_order_qty_pcs', ri.final_order_qty_pcs,
      'pieces_per_box', ri.pieces_per_box,
      'pcs_per_strip', ri.pcs_per_strip
    ) ORDER BY ri.medicine_name ASC
  ) INTO _items
  FROM public.requisition_items ri
  WHERE ri.requisition_id = _link.requisition_id;

  RETURN jsonb_build_object(
    'valid', true,
    'requisition_number', _requisition.requisition_number,
    'pharmacy_name', _pharmacy.name,
    'pharmacy_phone', _pharmacy.phone,
    'pharmacy_address', _pharmacy.address,
    'supplier_name', _supplier.name,
    'sr_name', _supplier.sr_name,
    'created_at', _link.created_at,
    'expires_at', _link.expires_at,
    'status', _requisition.status,
    'notes', _requisition.notes,
    'sr_acknowledged_at', _link.sr_acknowledged_at,
    'sr_estimated_delivery', _link.sr_estimated_delivery,
    'sr_notes', _link.sr_notes,
    'items', COALESCE(_items, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_sr_order_portal(text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 9. RPC 3: submit_sr_order_acknowledgment (Two-way Field Rep Feedback)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_sr_order_acknowledgment(
  _token text,
  _notes text DEFAULT NULL,
  _estimated_delivery timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _link_id uuid;
  _req_id uuid;
BEGIN
  SELECT id, requisition_id INTO _link_id, _req_id
  FROM public.requisition_magic_links
  WHERE token = _token
    AND is_revoked = FALSE
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid, expired, or revoked link.');
  END IF;

  UPDATE public.requisition_magic_links
  SET sr_acknowledged_at = now(),
      sr_estimated_delivery = COALESCE(_estimated_delivery, sr_estimated_delivery),
      sr_notes = COALESCE(_notes, sr_notes)
  WHERE id = _link_id;

  UPDATE public.requisitions
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = _req_id AND status IN ('draft', 'shared');

  RETURN jsonb_build_object(
    'success', true,
    'acknowledged_at', now(),
    'message', 'Order acknowledged successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_sr_order_acknowledgment(text, text, timestamptz) TO anon, authenticated;
