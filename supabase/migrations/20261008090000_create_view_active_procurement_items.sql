-- ==============================================================================
-- Migration: Active In-Flight Procurement View & Index Optimization
-- Version: 20261008090000
-- Purpose: Optimize rapid lookups for Delta Shortage calculation in Smart Planner
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INDEX OPTIMIZATION (Zero-Locking B-Tree Indexes)
-- ------------------------------------------------------------------------------

-- Composite B-Tree index on requisitions for tenant filtering, active status checks, and time sorting
CREATE INDEX IF NOT EXISTS idx_requisitions_pharmacy_status_created 
  ON public.requisitions(pharmacy_id, status, created_at DESC);

-- Composite B-Tree index on requisition_items covering requisition_id & medicine_id
CREATE INDEX IF NOT EXISTS idx_requisition_items_req_med 
  ON public.requisition_items(requisition_id, medicine_id);

-- Lookup index on medicine_id for reverse in-flight pipeline scans
CREATE INDEX IF NOT EXISTS idx_requisition_items_medicine_id 
  ON public.requisition_items(medicine_id)
  WHERE medicine_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. ACTIVE IN-FLIGHT PROCUREMENT VIEW
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.view_active_procurement_items AS
SELECT 
  ri.medicine_id,
  r.supplier_id,
  r.pharmacy_id,
  r.id AS requisition_id,
  r.requisition_number,
  r.status AS requisition_status,
  r.created_at AS requisition_created_at,
  COALESCE(ri.final_order_qty_pcs, 0) AS in_flight_pcs,
  ri.pack_mode,
  COALESCE(ri.boxes_to_order, 0) AS boxes_to_order
FROM public.requisition_items ri
JOIN public.requisitions r ON r.id = ri.requisition_id
WHERE r.status IN ('draft', 'shared', 'confirmed', 'sr_confirmed')
  AND r.created_at >= (NOW() - INTERVAL '7 days')
  AND ri.medicine_id IS NOT NULL;

-- Set security_invoker = true so PostgreSQL and Supabase PostgREST enforce underlying table RLS policies
ALTER VIEW public.view_active_procurement_items SET (security_invoker = true);

-- Grant appropriate permissions to authenticated users for PostgREST client queries
GRANT SELECT ON public.view_active_procurement_items TO authenticated;
GRANT SELECT ON public.view_active_procurement_items TO service_role;

COMMENT ON VIEW public.view_active_procurement_items IS 
'Real-time aggregation of unfulfilled requisition items (drafts, dispatched, confirmed) created within the last 7 days for Delta Shortage calculations.';
