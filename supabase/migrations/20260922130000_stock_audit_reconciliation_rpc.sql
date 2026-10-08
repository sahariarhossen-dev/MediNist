-- ==============================================================================
-- Migration: Stock Audit Reconciliation ACID RPC
-- File: supabase/migrations/20260922130000_stock_audit_reconciliation_rpc.sql
-- Description:
--   Implements reconcile_stock_audit RPC to atomically log physical cycle counts,
--   insert audit records into stock_audits & stock_audit_items, and adjust actual
--   inventory quantities in public.medicines.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_stock_audit(
  p_location_id uuid,
  p_notes text,
  p_items jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_pharmacy_id uuid;
  v_audit_id uuid;
  v_audit_num text;
  v_item jsonb;
  v_med_id text;
  v_med_name text;
  v_sys_qty integer;
  v_count_qty integer;
  v_variance integer;
  v_cost numeric;
  v_reason text;
  v_count integer := 0;
BEGIN
  -- 1. Verify caller profile & tenant
  SELECT pharmacy_id INTO v_caller_pharmacy_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_pharmacy_id IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unauthenticated caller';
  END IF;

  -- 2. Generate unique audit number
  v_audit_num := 'AUD-' || to_char(now(), 'YYYY') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');

  -- 3. Insert stock_audits header
  INSERT INTO public.stock_audits (
    pharmacy_id,
    location_id,
    audit_number,
    status,
    notes,
    conducted_by,
    conducted_at
  ) VALUES (
    v_caller_pharmacy_id,
    p_location_id,
    v_audit_num,
    'completed',
    p_notes,
    auth.uid(),
    now()
  ) RETURNING id INTO v_audit_id;

  -- 4. Process each audited item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_med_id := v_item->>'medicine_id';
    v_med_name := v_item->>'medicine_name';
    v_sys_qty := COALESCE((v_item->>'system_qty')::integer, 0);
    v_count_qty := COALESCE((v_item->>'counted_qty')::integer, 0);
    v_variance := v_count_qty - v_sys_qty;
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_reason := COALESCE(v_item->>'reason', 'Physical count adjustment');

    -- Insert item variance log
    INSERT INTO public.stock_audit_items (
      audit_id,
      pharmacy_id,
      medicine_id,
      medicine_name,
      system_qty,
      counted_qty,
      variance_qty,
      unit_cost,
      reason
    ) VALUES (
      v_audit_id,
      v_caller_pharmacy_id,
      v_med_id,
      v_med_name,
      v_sys_qty,
      v_count_qty,
      v_variance,
      v_cost,
      v_reason
    );

    -- Update actual stock level in public.medicines
    IF v_med_id IS NOT NULL AND v_med_id <> '' THEN
      UPDATE public.medicines
      SET stock_quantity = v_count_qty,
          updated_at = now()
      WHERE pharmacy_id = v_caller_pharmacy_id
        AND location_id = p_location_id
        AND (id::text = v_med_id OR LOWER(TRIM(name)) = LOWER(TRIM(v_med_name)));
    ELSE
      UPDATE public.medicines
      SET stock_quantity = v_count_qty,
          updated_at = now()
      WHERE pharmacy_id = v_caller_pharmacy_id
        AND location_id = p_location_id
        AND LOWER(TRIM(name)) = LOWER(TRIM(v_med_name));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object(
    'status', 'ok',
    'audit_id', v_audit_id,
    'audit_number', v_audit_num,
    'items_reconciled', v_count,
    'message', 'Physical stock audit recorded and inventory levels updated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_stock_audit(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stock_audit(uuid, text, jsonb) TO service_role;
