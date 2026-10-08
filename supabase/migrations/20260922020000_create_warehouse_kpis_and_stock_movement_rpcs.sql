-- Migration: 20260922020000_create_warehouse_kpis_and_stock_movement_rpcs.sql
-- Description: 
-- 1. Create composite indexes for fast warehouse inventory and stock dispatch queries
-- 2. Create high-performance single-query PostgreSQL RPC get_warehouse_kpis
-- 3. Create time-series continuous hourly stock movement RPC get_warehouse_stock_movement

-- ============================================================================
-- 1. COMPOSITE INDEXES FOR FAST FILTERING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_medicines_warehouse_kpi
ON public.medicines(pharmacy_id, location_id, stock_quantity, expiry_date);

CREATE INDEX IF NOT EXISTS idx_transfers_dispatch_flow
ON public.stock_transfers(pharmacy_id, from_location_id, status, accepted_at);

CREATE INDEX IF NOT EXISTS idx_transfers_inbound_flow
ON public.stock_transfers(pharmacy_id, to_location_id, status, accepted_at);

-- ============================================================================
-- 2. WAREHOUSE FAST-ACTION KPIS RPC
-- ============================================================================

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
  -- Security check: Verify caller belongs to the tenant
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND pharmacy_id = p_pharmacy_id
  ) THEN
    RAISE EXCEPTION 'Access Denied: Tenant mismatch';
  END IF;

  WITH inv_calc AS (
    SELECT
      COALESCE(SUM(
        COALESCE(stock_quantity, 0) * (
          COALESCE(price, 0) * 0.88
        )
      ), 0) AS total_val,
      COUNT(id) FILTER (WHERE stock_quantity <= COALESCE(stock_alert, 10)) AS short_count,
      COUNT(id) FILTER (
        WHERE stock_quantity > 0
          AND expiry_date IS NOT NULL
          AND expiry_date::date <= (CURRENT_DATE + (COALESCE(p_expiry_days, 60) || ' days')::interval)
          AND expiry_date::date >= CURRENT_DATE
      ) AS expiring_count
    FROM public.medicines
    WHERE pharmacy_id = p_pharmacy_id
      AND (location_id::text = p_location_id::text OR (location_id IS NULL AND p_location_id IS NULL))
  ),
  transfer_calc AS (
    SELECT
      COUNT(id) AS pending_count
    FROM public.stock_transfers
    WHERE pharmacy_id = p_pharmacy_id
      AND from_location_id::text = p_location_id::text
      AND status = 'pending'
  )
  SELECT json_build_object(
    'total_inventory_value', ROUND(inv_calc.total_val, 2),
    'pending_dispatches', transfer_calc.pending_count,
    'short_items_count', inv_calc.short_count,
    'expiring_soon_count', inv_calc.expiring_count
  ) INTO v_result
  FROM inv_calc, transfer_calc;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_warehouse_kpis(uuid, uuid, int) TO authenticated, service_role;

-- ============================================================================
-- 3. WAREHOUSE TIME-SERIES STOCK MOVEMENT RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_warehouse_stock_movement(
  p_pharmacy_id uuid,
  p_location_id uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_timezone text DEFAULT 'Asia/Dhaka'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := COALESCE(NULLIF(p_timezone, ''), 'Asia/Dhaka');
  v_target_date date := COALESCE(p_date, (now() AT TIME ZONE v_tz)::date);
  v_result json;
BEGIN
  -- Security check: Verify caller belongs to the tenant
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND pharmacy_id = p_pharmacy_id
  ) THEN
    RAISE EXCEPTION 'Access Denied: Tenant mismatch';
  END IF;

  WITH hours AS (
    SELECT generate_series(0, 23) AS hour_num
  ),
  inbound AS (
    SELECT
      EXTRACT(HOUR FROM (st.accepted_at AT TIME ZONE v_tz))::int AS hour_num,
      SUM(COALESCE(st.quantity, 0)) AS qty,
      SUM(COALESCE(st.quantity, 0) * COALESCE(m.price * 0.88, m.price, 0)) AS val
    FROM public.stock_transfers st
    LEFT JOIN public.medicines m ON m.id = st.medicine_id
    WHERE st.pharmacy_id = p_pharmacy_id
      AND st.to_location_id = p_location_id::text
      AND st.status = 'accepted'
      AND st.accepted_at IS NOT NULL
      AND (st.accepted_at AT TIME ZONE v_tz)::date = v_target_date
    GROUP BY 1
  ),
  outbound AS (
    SELECT
      EXTRACT(HOUR FROM (st.accepted_at AT TIME ZONE v_tz))::int AS hour_num,
      SUM(COALESCE(st.quantity, 0)) AS qty,
      SUM(COALESCE(st.quantity, 0) * COALESCE(m.price * 0.88, m.price, 0)) AS val
    FROM public.stock_transfers st
    LEFT JOIN public.medicines m ON m.id = st.medicine_id
    WHERE st.pharmacy_id = p_pharmacy_id
      AND st.from_location_id = p_location_id::text
      AND st.status = 'accepted'
      AND st.accepted_at IS NOT NULL
      AND (st.accepted_at AT TIME ZONE v_tz)::date = v_target_date
    GROUP BY 1
  )
  SELECT json_agg(
    json_build_object(
      'hour', h.hour_num,
      'label', CASE
        WHEN h.hour_num = 0 THEN '12 AM'
        WHEN h.hour_num = 12 THEN '12 PM'
        WHEN h.hour_num < 12 THEN h.hour_num || ' AM'
        ELSE (h.hour_num - 12) || ' PM'
      END,
      'time', lpad(h.hour_num::text, 2, '0') || ':00',
      'inbound_qty', COALESCE(i.qty, 0),
      'inbound_val', ROUND(COALESCE(i.val, 0), 2),
      'outbound_qty', COALESCE(o.qty, 0),
      'outbound_val', ROUND(COALESCE(o.val, 0), 2),
      'net_qty', COALESCE(i.qty, 0) - COALESCE(o.qty, 0),
      'net_val', ROUND(COALESCE(i.val, 0) - COALESCE(o.val, 0), 2)
    )
    ORDER BY h.hour_num ASC
  ) INTO v_result
  FROM hours h
  LEFT JOIN inbound i ON i.hour_num = h.hour_num
  LEFT JOIN outbound o ON o.hour_num = h.hour_num;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_warehouse_stock_movement(uuid, uuid, date, text) TO authenticated, service_role;
