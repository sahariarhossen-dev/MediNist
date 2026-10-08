-- Migration: 20260922030000_warehouse_erp_phase1_schema_rls_and_rpcs.sql
-- Description:
-- 1. Schema Harmonization: shop_locations type constraint & RLS fix for sibling branch visibility
-- 2. Procurement Tables: suppliers, purchase_orders, purchase_order_items
-- 3. Distribution Tables: branch_requisitions, branch_requisition_items
-- 4. Audit Tables: stock_audits, stock_audit_items
-- 5. Comprehensive RLS policies for tenant-isolated access
-- 6. ACID Stored Procedures (RPCs): receive_purchase_order_grn, approve_requisition_to_dispatch

-- ============================================================================
-- 1. SCHEMA HARMONIZATION & RLS CORRECTIONS
-- ============================================================================

-- Ensure shop_locations type allows 'branch', 'warehouse', 'shop', 'godown'
ALTER TABLE public.shop_locations DROP CONSTRAINT IF EXISTS shop_locations_type_check;
ALTER TABLE public.shop_locations 
ADD CONSTRAINT shop_locations_type_check 
CHECK (type IN ('branch', 'warehouse', 'shop', 'godown'));

-- Fix the "Blind Dispatcher" RLS policy on shop_locations:
-- Allow all authenticated members of a pharmacy to read location headers within their tenant
-- so that warehouse staff can see destination branches when dispatching stock.
DROP POLICY IF EXISTS "shop_locations_select_policy" ON public.shop_locations;

CREATE POLICY "shop_locations_select_policy"
ON public.shop_locations
FOR SELECT
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- Allow managers as well as owners/admins to update stock_transfers (dispatch & receive)
DROP POLICY IF EXISTS "stock_transfers_update_policy" ON public.stock_transfers;

CREATE POLICY "stock_transfers_update_policy"
ON public.stock_transfers
FOR UPDATE
TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

-- ============================================================================
-- 2. PROCUREMENT MODULE TABLES (Suppliers, Purchase Orders, PO Items)
-- ============================================================================

-- Suppliers (Vendor Registry)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms text DEFAULT 'net_30',
  balance numeric(12,2) DEFAULT 0.00 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy ON public.suppliers(pharmacy_id, is_active);

-- Purchase Orders (Inbound to Warehouse)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partial_received', 'received', 'cancelled')),
  total_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
  paid_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expected_delivery_date date,
  received_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_po_pharmacy_number UNIQUE (pharmacy_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_pharmacy_warehouse ON public.purchase_orders(pharmacy_id, warehouse_id, status);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  medicine_id text,
  medicine_name text NOT NULL,
  ordered_qty integer NOT NULL CHECK (ordered_qty > 0),
  received_qty integer DEFAULT 0 NOT NULL CHECK (received_qty >= 0),
  unit_cost numeric(10,2) DEFAULT 0.00 NOT NULL,
  batch_number text,
  expiry_date date,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_po_items_order ON public.purchase_order_items(purchase_order_id);

-- ============================================================================
-- 3. DISTRIBUTION MODULE TABLES (Branch Requisitions & Items)
-- ============================================================================

-- Branch Requisitions (Branch -> Warehouse Pull Demand)
CREATE TABLE IF NOT EXISTS public.branch_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  from_branch_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  to_warehouse_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  requisition_number text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'approved', 'dispatched', 'partially_fulfilled', 'completed', 'rejected')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'urgent')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_requisition_pharmacy_number UNIQUE (pharmacy_id, requisition_number)
);

CREATE INDEX IF NOT EXISTS idx_req_pharmacy_flow ON public.branch_requisitions(pharmacy_id, to_warehouse_id, status);

-- Branch Requisition Items
CREATE TABLE IF NOT EXISTS public.branch_requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.branch_requisitions(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  medicine_id text,
  medicine_name text NOT NULL,
  requested_qty integer NOT NULL CHECK (requested_qty > 0),
  approved_qty integer DEFAULT 0 NOT NULL CHECK (approved_qty >= 0),
  dispatched_qty integer DEFAULT 0 NOT NULL CHECK (dispatched_qty >= 0),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_req_items_requisition ON public.branch_requisition_items(requisition_id);

-- ============================================================================
-- 4. AUDIT & RECONCILIATION TABLES (Stock Audits & Items)
-- ============================================================================

-- Stock Audits
CREATE TABLE IF NOT EXISTS public.stock_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.shop_locations(id) ON DELETE SET NULL,
  audit_number text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes text,
  conducted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conducted_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_audit_pharmacy_number UNIQUE (pharmacy_id, audit_number)
);

CREATE INDEX IF NOT EXISTS idx_audits_pharmacy_loc ON public.stock_audits(pharmacy_id, location_id, status);

-- Stock Audit Items
CREATE TABLE IF NOT EXISTS public.stock_audit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.stock_audits(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  medicine_id text,
  medicine_name text NOT NULL,
  system_qty integer NOT NULL DEFAULT 0,
  counted_qty integer NOT NULL DEFAULT 0,
  variance_qty integer NOT NULL DEFAULT 0,
  unit_cost numeric(10,2) DEFAULT 0.00 NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON public.stock_audit_items(audit_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_items ENABLE ROW LEVEL SECURITY;

-- 5.1 Suppliers RLS
CREATE POLICY "suppliers_select_policy" ON public.suppliers
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "suppliers_insert_policy" ON public.suppliers
FOR INSERT TO authenticated
WITH CHECK (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "suppliers_update_policy" ON public.suppliers
FOR UPDATE TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "suppliers_delete_policy" ON public.suppliers
FOR DELETE TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

-- 5.2 Purchase Orders & Items RLS
CREATE POLICY "purchase_orders_select_policy" ON public.purchase_orders
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "purchase_orders_insert_policy" ON public.purchase_orders
FOR INSERT TO authenticated
WITH CHECK (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "purchase_orders_update_policy" ON public.purchase_orders
FOR UPDATE TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "purchase_orders_delete_policy" ON public.purchase_orders
FOR DELETE TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

CREATE POLICY "purchase_order_items_select_policy" ON public.purchase_order_items
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "purchase_order_items_all_policy" ON public.purchase_order_items
FOR ALL TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

-- 5.3 Branch Requisitions & Items RLS
CREATE POLICY "branch_requisitions_select_policy" ON public.branch_requisitions
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "branch_requisitions_insert_policy" ON public.branch_requisitions
FOR INSERT TO authenticated
WITH CHECK (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager', 'salesman')
);

CREATE POLICY "branch_requisitions_update_policy" ON public.branch_requisitions
FOR UPDATE TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "branch_requisitions_delete_policy" ON public.branch_requisitions
FOR DELETE TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin')
);

CREATE POLICY "branch_requisition_items_select_policy" ON public.branch_requisition_items
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "branch_requisition_items_all_policy" ON public.branch_requisition_items
FOR ALL TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager', 'salesman')
);

-- 5.4 Stock Audits & Items RLS
CREATE POLICY "stock_audits_select_policy" ON public.stock_audits
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "stock_audits_all_policy" ON public.stock_audits
FOR ALL TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

CREATE POLICY "stock_audit_items_select_policy" ON public.stock_audit_items
FOR SELECT TO authenticated
USING (pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "stock_audit_items_all_policy" ON public.stock_audit_items
FOR ALL TO authenticated
USING (
  pharmacy_id = (SELECT p.pharmacy_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('owner', 'admin', 'manager')
);

-- ============================================================================
-- 6. ACID STORED PROCEDURES (RPCs)
-- ============================================================================

-- 6.1 Receive Purchase Order Goods Received Note (GRN)
CREATE OR REPLACE FUNCTION public.receive_purchase_order_grn(
  p_po_id uuid,
  p_items jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po record;
  v_caller_pharmacy_id uuid;
  v_item jsonb;
  v_med_id text;
  v_med_name text;
  v_recv_qty integer;
  v_batch text;
  v_exp date;
  v_cost numeric;
  v_existing_med_id uuid;
BEGIN
  -- Verify caller profile
  SELECT pharmacy_id INTO v_caller_pharmacy_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_pharmacy_id IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unauthenticated caller';
  END IF;

  -- Load PO
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id AND pharmacy_id = v_caller_pharmacy_id;

  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase Order not found or tenant mismatch';
  END IF;

  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Purchase Order has already been fully received';
  END IF;

  -- Process each received item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_med_id := v_item->>'medicine_id';
    v_med_name := v_item->>'medicine_name';
    v_recv_qty := COALESCE((v_item->>'received_qty')::integer, 0);
    v_batch := v_item->>'batch_number';
    v_exp := CASE WHEN v_item->>'expiry_date' IS NOT NULL AND v_item->>'expiry_date' <> '' 
                  THEN (v_item->>'expiry_date')::date ELSE NULL END;
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);

    IF v_recv_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Update purchase_order_items
    UPDATE public.purchase_order_items
    SET received_qty = received_qty + v_recv_qty,
        batch_number = COALESCE(v_batch, batch_number),
        expiry_date = COALESCE(v_exp, expiry_date)
    WHERE purchase_order_id = p_po_id
      AND (medicine_id = v_med_id OR medicine_name = v_med_name);

    -- Stock ingestion into medicines table at the warehouse location
    SELECT id INTO v_existing_med_id
    FROM public.medicines
    WHERE pharmacy_id = v_caller_pharmacy_id
      AND location_id = v_po.warehouse_id
      AND (id::text = v_med_id OR LOWER(TRIM(name)) = LOWER(TRIM(v_med_name)))
    LIMIT 1;

    IF v_existing_med_id IS NOT NULL THEN
      -- Existing stock record: increment quantity
      UPDATE public.medicines
      SET stock_quantity = stock_quantity + v_recv_qty,
          batch_number = COALESCE(v_batch, batch_number),
          expiry_date = COALESCE(v_exp, expiry_date),
          purchase_price_unit = CASE WHEN v_cost > 0 THEN v_cost ELSE purchase_price_unit END,
          updated_at = now()
      WHERE id = v_existing_med_id;
    ELSE
      -- Insert new medicine record at this warehouse
      INSERT INTO public.medicines (
        pharmacy_id,
        location_id,
        name,
        stock_quantity,
        price,
        purchase_price_unit,
        batch_number,
        expiry_date,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_caller_pharmacy_id,
        v_po.warehouse_id,
        v_med_name,
        v_recv_qty,
        CASE WHEN v_cost > 0 THEN ROUND(v_cost * 1.15, 2) ELSE 10.00 END,
        v_cost,
        v_batch,
        v_exp,
        true,
        now(),
        now()
      );
    END IF;
  END LOOP;

  -- Mark PO as received
  UPDATE public.purchase_orders
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_po_id;

  RETURN json_build_object(
    'status', 'ok',
    'purchase_order_id', p_po_id,
    'message', 'Goods Received Note processed and inventory balance updated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order_grn(uuid, jsonb) TO authenticated, service_role;

-- 6.2 Approve Requisition and Generate Dispatch Transfer Challan
CREATE OR REPLACE FUNCTION public.approve_requisition_to_dispatch(
  p_requisition_id uuid,
  p_items jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_caller_pharmacy_id uuid;
  v_item jsonb;
  v_med_id text;
  v_med_name text;
  v_dispatch_qty integer;
  v_transfer_count integer := 0;
BEGIN
  -- Verify caller profile
  SELECT pharmacy_id INTO v_caller_pharmacy_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_pharmacy_id IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unauthenticated caller';
  END IF;

  -- Load Requisition
  SELECT * INTO v_req
  FROM public.branch_requisitions
  WHERE id = p_requisition_id AND pharmacy_id = v_caller_pharmacy_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Requisition not found or tenant mismatch';
  END IF;

  -- Process approved dispatch items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_med_id := v_item->>'medicine_id';
    v_med_name := v_item->>'medicine_name';
    v_dispatch_qty := COALESCE((v_item->>'dispatched_qty')::integer, 0);

    IF v_dispatch_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Update requisition item record
    UPDATE public.branch_requisition_items
    SET approved_qty = v_dispatch_qty,
        dispatched_qty = v_dispatch_qty
    WHERE requisition_id = p_requisition_id
      AND (medicine_id = v_med_id OR medicine_name = v_med_name);

    -- Generate stock_transfers Challan record
    INSERT INTO public.stock_transfers (
      pharmacy_id,
      from_location_id,
      to_location_id,
      medicine_id,
      medicine_name,
      quantity,
      unit,
      status,
      notes,
      created_at
    ) VALUES (
      v_caller_pharmacy_id,
      v_req.to_warehouse_id::text,
      v_req.from_branch_id::text,
      v_med_id,
      v_med_name,
      v_dispatch_qty,
      'pcs',
      'pending',
      'Auto-generated from Requisition #' || v_req.requisition_number,
      now()
    );

    -- Decrement warehouse inventory stock
    UPDATE public.medicines
    SET stock_quantity = GREATEST(0, stock_quantity - v_dispatch_qty),
        updated_at = now()
    WHERE pharmacy_id = v_caller_pharmacy_id
      AND location_id = v_req.to_warehouse_id
      AND (id::text = v_med_id OR LOWER(TRIM(name)) = LOWER(TRIM(v_med_name)));

    v_transfer_count := v_transfer_count + 1;
  END LOOP;

  -- Update Requisition status
  UPDATE public.branch_requisitions
  SET status = 'dispatched',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_requisition_id;

  RETURN json_build_object(
    'status', 'ok',
    'requisition_id', p_requisition_id,
    'transfers_generated', v_transfer_count,
    'message', 'Requisition approved and dispatch transfers generated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_requisition_to_dispatch(uuid, jsonb) TO authenticated, service_role;
