-- ==============================================================================
-- Migration: Multi-Branch Isolation for Public SR Order Portal
-- Incident ID: PO-DATA-ISO-01 (Phase 3)
-- Description:
--   Ensures public order link access resolves branch-level identity (shop_locations)
--   with strict priority over root tenant organization (pharmacies).
--   Completely eliminates parent company ("City Shop") leaks on distributor order slips.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_public_sr_order_portal(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _link record;
  _pharmacy record;
  _location record;
  _supplier record;
  _requisition record;
  _items jsonb;
  _pharmacy_name text;
  _pharmacy_address text;
  _pharmacy_phone text;
  _branch_code text;
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

  -- 3. Fetch Requisition, Location (Branch), Root Pharmacy & Supplier Context
  SELECT 
    r.id,
    r.requisition_number,
    r.location_id,
    r.pharmacy_id,
    r.supplier_id,
    r.status,
    r.notes,
    r.total_estimated_amount,
    r.created_at
  INTO _requisition
  FROM public.requisitions r
  WHERE r.id = _link.requisition_id;

  -- Fetch Root Tenant Pharmacy
  SELECT name, phone, address INTO _pharmacy 
  FROM public.pharmacies WHERE id = COALESCE(_requisition.pharmacy_id, _link.pharmacy_id);

  -- Fetch Specific Issuing Outlet / Branch Location
  IF _requisition.location_id IS NOT NULL THEN
    SELECT id, name, phone, address, city, code INTO _location
    FROM public.shop_locations WHERE id = _requisition.location_id;
  END IF;

  -- Fetch Supplier & Field Representative Metadata
  SELECT name, sr_name, sr_phone INTO _supplier 
  FROM public.suppliers WHERE id = COALESCE(_requisition.supplier_id, _link.supplier_id);

  -- Strict Priority Rule: Active Outlet / Branch overrides root tenant organization
  _pharmacy_name := COALESCE(_location.name, _pharmacy.name, 'Pharmacy Order');
  _pharmacy_address := COALESCE(_location.address, _location.city, _pharmacy.address);
  _pharmacy_phone := COALESCE(_location.phone, _pharmacy.phone);
  _branch_code := _location.code;

  -- 4. Aggregate Sanitized Order Items (No profit margins or trade secrets)
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
    'location_id', _requisition.location_id,
    'branch_code', _branch_code,
    'issuing_pharmacy_name', _pharmacy_name,
    'issuing_pharmacy_address', _pharmacy_address,
    'issuing_pharmacy_phone', _pharmacy_phone,
    'pharmacy_name', _pharmacy_name,
    'pharmacy_phone', _pharmacy_phone,
    'pharmacy_address', _pharmacy_address,
    'branch_name', _location.name,
    'branch_address', _location.address,
    'branch_phone', _location.phone,
    'supplier_name', _supplier.name,
    'sr_name', _supplier.sr_name,
    'created_at', _link.created_at,
    'expires_at', _link.expires_at,
    'status', _requisition.status,
    'notes', _requisition.notes,
    'sr_acknowledged_at', _link.sr_acknowledged_at,
    'sr_estimated_delivery', _link.sr_estimated_delivery,
    'sr_notes', _link.sr_notes,
    'items', COALESCE(_items, '[]'::jsonb),
    'location', CASE WHEN _location.id IS NOT NULL THEN jsonb_build_object(
      'id', _location.id,
      'name', _location.name,
      'address', _location.address,
      'city', _location.city,
      'phone', _location.phone,
      'code', _location.code
    ) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_sr_order_portal(text) TO anon, authenticated;
