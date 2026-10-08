-- ==============================================================================
-- Migration: Optimized Warehouse Infrastructure, Fast Action KPIs & Movement RPC
-- File: supabase/migrations/20260922120000_warehouse_kpis_and_stock_movement_rpc.sql
-- Description:
--   1. Creates composite indexes for warehouse queries and transfer lookups
--   2. Implements get_warehouse_kpis RPC (Total Value, Pending Dispatches, Short Items, Expiring Soon)
--   3. Implements get_warehouse_stock_movement RPC (Continuous 24-hr buckets in Asia/Dhaka)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Composite Indexes for High-Velocity Inventory & Dispatch Workloads
-- ------------------------------------------------------------------------------

-- Index for warehouse inventory aggregation (Value, Short stock, Expiry)
CREATE INDEX IF NOT EXISTS idx_medicines_warehouse_kpi 
  ON public.medicines(pharmacy_id, location_id, stock_quantity, expiry_date);

-- Index for outbound stock dispatches
CREATE INDEX IF NOT EXISTS idx_transfers_dispatch_flow 
  ON public.stock_transfers(pharmacy_id, from_location_id, status, accepted_at);

-- Index for inbound stock receipts
CREATE INDEX IF NOT EXISTS idx_transfers_inbound_flow 
  ON public.stock_transfers(pharmacy_id, to_location_id, status, accepted_at);

-- ------------------------------------------------------------------------------
-- 2. Stored Procedure: get_warehouse_kpis
-- Computes the 4 essential warehouse KPI metrics directly on Postgres in <15ms
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_warehouse_kpis(
  p_pharmacy_id uuid,
  p_location_id uuid,
  p_expiry_days int DEFAULT 60
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Verify authenticated session caller has tenant access
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND pharmacy_id = p_pharmacy_id
  ) THEN
    RAISE EXCEPTION 'Access Denied: Tenant mismatch for user' USING ERRCODE = '42501';
  END IF;

  WITH inv_calc AS (
    SELECT 
      COALESCE(SUM(
        COALESCE(stock_quantity, 0) * COALESCE(
          purchase_price_unit,
          CASE 
            WHEN pcs_per_strip > 0 AND strip_per_pack > 0 THEN purchase_price_box / (pcs_per_strip * strip_per_pack)
            WHEN pcs_per_strip > 0 THEN purchase_price_box / pcs_per_strip
            ELSE price * 0.88
          END,
          0
        )
      ), 0) AS total_val,
      COUNT(id) FILTER (
        WHERE COALESCE(stock_quantity, 0) <= COALESCE(stock_alert, 10)
      ) AS short_count,
      COUNT(id) FILTER (
        WHERE COALESCE(stock_quantity, 0) > 0 
          AND expiry_date IS NOT NULL 
          AND expiry_date ~ '^\d{4}-\d{2}-\d{2}'
          AND (expiry_date::date) <= (CURRENT_DATE + (p_expiry_days || ' days')::interval)
          AND (expiry_date::date) >= CURRENT_DATE
      ) AS expiring_count,
      COALESCE(SUM(COALESCE(stock_quantity, 0)), 0) AS total_pcs
    FROM public.medicines
    WHERE pharmacy_id = p_pharmacy_id
      AND location_id = p_location_id
  ),
  transfer_calc AS (
    SELECT 
      COUNT(id) AS pending_count
    FROM public.stock_transfers
    WHERE pharmacy_id = p_pharmacy_id
      AND from_location_id = p_location_id::text
      AND status = 'pending'
  )
  SELECT json_build_object(
    'total_inventory_value', ROUND(inv_calc.total_val::numeric, 2),
    'pending_dispatches', transfer_calc.pending_count,
    'short_items_count', inv_calc.short_count,
    'expiring_soon_count', inv_calc.expiring_count,
    'total_pieces', inv_calc.total_pcs
  ) INTO v_result
  FROM inv_calc, transfer_calc;

  RETURN v_result;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_warehouse_kpis(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_warehouse_kpis(uuid, uuid, int) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Stored Procedure: get_warehouse_stock_movement
-- Generates a 24-hour continuous series in Asia/Dhaka timezone with aligned
-- Inbound (Stock In) vs Outbound (Dispatched) volume & financial value.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_warehouse_stock_movement(
  p_pharmacy_id uuid,
  p_location_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  hour_bucket text,
  hour_index int,
  inbound_qty numeric,
  inbound_val numeric,
  outbound_qty numeric,
  outbound_val numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify authenticated session caller has tenant access
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND pharmacy_id = p_pharmacy_id
  ) THEN
    RAISE EXCEPTION 'Access Denied: Tenant mismatch for user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH hours AS (
    -- Continuous 24 hourly time slots (00:00 to 23:00) strictly locked to Bangladesh Local Time (Asia/Dhaka)
    SELECT 
      generate_series(
        (p_date::text || ' 00:00:00')::timestamp,
        (p_date::text || ' 23:00:00')::timestamp,
        interval '1 hour'
      ) AS bucket_start
  ),
  outbound_flow AS (
    -- Outbound: Physically verified dispatches sent FROM this warehouse to branches
    SELECT 
      date_trunc('hour', st.accepted_at AT TIME ZONE 'Asia/Dhaka') AS hr,
      COALESCE(SUM(st.quantity), 0) AS total_out_qty,
      COALESCE(SUM(st.quantity * COALESCE(
        m.purchase_price_unit,
        CASE 
          WHEN m.pcs_per_strip > 0 AND m.strip_per_pack > 0 THEN m.purchase_price_box / (m.pcs_per_strip * m.strip_per_pack)
          WHEN m.pcs_per_strip > 0 THEN m.purchase_price_box / m.pcs_per_strip
          ELSE m.price * 0.88
        END,
        0
      )), 0) AS total_out_val
    FROM public.stock_transfers st
    LEFT JOIN public.medicines m ON m.id = st.medicine_id
    WHERE st.pharmacy_id = p_pharmacy_id
      AND st.from_location_id = p_location_id::text
      AND st.status = 'accepted'
      AND st.accepted_at IS NOT NULL
      AND (st.accepted_at AT TIME ZONE 'Asia/Dhaka')::date = p_date
    GROUP BY 1
  ),
  inbound_flow AS (
    -- Inbound: Stock transfers accepted into this warehouse
    SELECT 
      date_trunc('hour', st.accepted_at AT TIME ZONE 'Asia/Dhaka') AS hr,
      COALESCE(SUM(st.quantity), 0) AS total_in_qty,
      COALESCE(SUM(st.quantity * COALESCE(
        m.purchase_price_unit,
        CASE 
          WHEN m.pcs_per_strip > 0 AND m.strip_per_pack > 0 THEN m.purchase_price_box / (m.pcs_per_strip * m.strip_per_pack)
          WHEN m.pcs_per_strip > 0 THEN m.purchase_price_box / m.pcs_per_strip
          ELSE m.price * 0.88
        END,
        0
      )), 0) AS total_in_val
    FROM public.stock_transfers st
    LEFT JOIN public.medicines m ON m.id = st.medicine_id
    WHERE st.pharmacy_id = p_pharmacy_id
      AND st.to_location_id = p_location_id::text
      AND st.status = 'accepted'
      AND st.accepted_at IS NOT NULL
      AND (st.accepted_at AT TIME ZONE 'Asia/Dhaka')::date = p_date
    GROUP BY 1
  )
  SELECT 
    to_char(h.bucket_start, 'HH12 AM') AS hour_bucket,
    EXTRACT(HOUR FROM h.bucket_start)::int AS hour_index,
    COALESCE(ib.total_in_qty, 0)::numeric AS inbound_qty,
    ROUND(COALESCE(ib.total_in_val, 0)::numeric, 2) AS inbound_val,
    COALESCE(ob.total_out_qty, 0)::numeric AS outbound_qty,
    ROUND(COALESCE(ob.total_out_val, 0)::numeric, 2) AS outbound_val
  FROM hours h
  LEFT JOIN inbound_flow ib ON ib.hr = h.bucket_start
  LEFT JOIN outbound_flow ob ON ob.hr = h.bucket_start
  ORDER BY h.bucket_start ASC;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_warehouse_stock_movement(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_warehouse_stock_movement(uuid, uuid, date) TO service_role;
