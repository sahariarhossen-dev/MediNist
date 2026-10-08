-- Migration: 20260920150000_pharmacy_location_trigger_and_complete_sale.sql
-- Description: 
-- 1. Create trigger on public.pharmacies to automatically provision a main branch in public.shop_locations on signup
-- 2. Create trigger on public.profiles to automatically set assigned_location_id to main branch when linked to pharmacy
-- 3. Upgrade public.complete_sale(_payload jsonb) to enforce location-aware stock deductions, sale tagging, customer ledger tagging, and cash transaction tagging

-- ============================================================================
-- 1. PHARMACY REGISTRATION TRIGGER: AUTOMATIC MAIN LOCATION CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_pharmacy_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_loc_id uuid;
BEGIN
  -- Insert default main shop location for the newly registered pharmacy
  INSERT INTO public.shop_locations (
    pharmacy_id,
    name,
    type,
    address,
    is_main,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.name), ''), 'Main Pharmacy') || ' - Main Branch',
    'shop',
    NEW.address,
    true,
    true,
    now(),
    now()
  )
  RETURNING id INTO v_main_loc_id;

  -- If any profile already linked to this pharmacy has no assigned location, link it now
  UPDATE public.profiles
  SET assigned_location_id = v_main_loc_id
  WHERE pharmacy_id = NEW.id
    AND assigned_location_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_default_location ON public.pharmacies;
CREATE TRIGGER trg_pharmacy_default_location
  AFTER INSERT ON public.pharmacies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_pharmacy_default_location();

-- ============================================================================
-- 2. PROFILE TRIGGER: AUTO-ASSIGN MAIN LOCATION WHEN LINKED TO PHARMACY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_profile_default_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_loc_id uuid;
BEGIN
  IF NEW.pharmacy_id IS NOT NULL AND NEW.assigned_location_id IS NULL THEN
    SELECT id INTO v_main_loc_id
    FROM public.shop_locations
    WHERE pharmacy_id = NEW.pharmacy_id
      AND is_main = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_main_loc_id IS NOT NULL THEN
      NEW.assigned_location_id := v_main_loc_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_default_location ON public.profiles;
CREATE TRIGGER trg_profile_default_location
  BEFORE INSERT OR UPDATE OF pharmacy_id, assigned_location_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_default_location();

-- ============================================================================
-- 3. UPGRADE complete_sale RPC: LOCATION-ENFORCED DEDUCTIONS & FINANCIAL ISOLATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_sale(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
  v_location_id uuid;
  v_sale_id uuid;
  v_draft_id uuid;
  v_sale_type text;
  v_subtotal numeric;
  v_discount_percent numeric;
  v_discount_amount numeric;
  v_total numeric;
  v_gross numeric;
  v_net numeric;
  v_items jsonb;
  v_item jsonb;
  v_qty int;
  v_med_id uuid;
  v_updated uuid;
  v_payment_method text;
  v_paid_now numeric;
  v_due_amt numeric;
  v_customer_id uuid;
  v_customer_name text;
  v_max_discount numeric;
  v_require_approval boolean;
  v_pending boolean := false;
BEGIN
  -- 1. Authenticate user
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- 2. Staff authorization guards
  IF public.is_staff_suspended(v_user) THEN
    RAISE EXCEPTION 'ACCESS_SUSPENDED: Your access has been suspended by the shop owner' USING ERRCODE = '42501';
  END IF;

  IF public.is_staff_read_only(v_user) THEN
    RAISE EXCEPTION 'ACCESS_READ_ONLY: App blocked by shop owner' USING ERRCODE = '42501';
  END IF;

  -- 3. Resolve parent pharmacy (Mother ID)
  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy linked to your account' USING ERRCODE = '22023';
  END IF;

  -- 4. Resolve active shop location (Child Location ID) with graceful fallback
  v_location_id := NULLIF(_payload->>'location_id', '')::uuid;

  IF v_location_id IS NULL THEN
    SELECT assigned_location_id INTO v_location_id
    FROM public.profiles
    WHERE id = v_user AND pharmacy_id = v_pharmacy;
  END IF;

  IF v_location_id IS NULL THEN
    SELECT id INTO v_location_id
    FROM public.shop_locations
    WHERE pharmacy_id = v_pharmacy AND is_main = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_location_id IS NULL THEN
    SELECT id INTO v_location_id
    FROM public.shop_locations
    WHERE pharmacy_id = v_pharmacy
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 5. Extract and validate payload parameters
  v_draft_id        := NULLIF(_payload->>'draft_id', '')::uuid;
  v_sale_type       := COALESCE(_payload->>'sale_type', 'retail');
  v_discount_percent:= LEAST(GREATEST(COALESCE((_payload->>'discount_percent')::numeric, 0), 0), 100);
  v_items           := _payload->'items';
  v_payment_method  := COALESCE(_payload#>>'{payment,method}', 'cash');
  v_paid_now        := COALESCE((_payload#>>'{payment,paid_now}')::numeric, 0);
  v_customer_id     := NULLIF(_payload#>>'{payment,customer_id}', '')::uuid;
  v_customer_name   := _payload#>>'{payment,customer_name}';

  IF v_sale_type NOT IN ('retail', 'wholesale') THEN
    RAISE EXCEPTION 'Invalid sale_type' USING ERRCODE = '22023';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one item' USING ERRCODE = '22023';
  END IF;

  IF v_payment_method NOT IN ('cash', 'due', 'split') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;

  IF v_payment_method IN ('due', 'split') AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer required for due/split payments' USING ERRCODE = '22023';
  END IF;

  IF v_sale_type = 'wholesale' THEN
    v_discount_percent := 0;
  END IF;

  -- 6. Check pharmacy discount limits
  SELECT COALESCE(max_discount_percent, 15), COALESCE(require_discount_approval, true)
    INTO v_max_discount, v_require_approval
    FROM public.pharmacy_settings WHERE pharmacy_id = v_pharmacy;
  v_max_discount := COALESCE(v_max_discount, 15);
  v_require_approval := COALESCE(v_require_approval, true);

  IF v_require_approval
     AND v_discount_percent > v_max_discount
     AND NOT public.has_staff_permission(v_user, 'override_discount') THEN
    v_pending := true;
  END IF;

  -- 7. Insert or update the sale header with location_id
  IF v_draft_id IS NOT NULL THEN
    UPDATE public.sales
       SET sale_type = v_sale_type,
           location_id = COALESCE(v_location_id, location_id),
           status = CASE WHEN v_pending THEN 'pending_approval' ELSE 'completed' END
     WHERE id = v_draft_id
       AND pharmacy_id = v_pharmacy
       AND status = 'draft'
     RETURNING id INTO v_sale_id;

    IF v_sale_id IS NULL THEN
      RAISE EXCEPTION 'Draft sale not found or already completed' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.sale_items WHERE sale_id = v_sale_id;
  ELSE
    INSERT INTO public.sales (
      pharmacy_id, location_id, user_id, sale_type, subtotal,
      discount_percent, discount_amount, total, status
    ) VALUES (
      v_pharmacy, v_location_id, v_user, v_sale_type, 0, v_discount_percent, 0, 0,
      CASE WHEN v_pending THEN 'pending_approval' ELSE 'completed' END
    ) RETURNING id INTO v_sale_id;
  END IF;

  -- 8. Loop through items: Record sale items & execute location-enforced stock deductions
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_med_id := (v_item->>'medicine_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be positive' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sale_items (
      sale_id, medicine_id, medicine_name, company_name,
      quantity, unit_price, total_price, discount_percent
    ) VALUES (
      v_sale_id,
      v_med_id,
      v_item->>'medicine_name',
      v_item->>'company_name',
      v_qty,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'total_price')::numeric, 0),
      CASE WHEN v_sale_type = 'wholesale'
           THEN COALESCE((v_item->>'discount_percent')::numeric, 0)
           ELSE 0 END
    );

    -- Location-Enforced Deduction:
    -- Decrement stock strictly matching product ID, pharmacy, and location context.
    UPDATE public.medicines
       SET stock_quantity = stock_quantity - v_qty,
           updated_at = now()
     WHERE id = v_med_id
       AND pharmacy_id = v_pharmacy
       AND (location_id = v_location_id OR location_id IS NULL)
       AND COALESCE(stock_quantity, 0) >= v_qty
     RETURNING id INTO v_updated;

    IF v_updated IS NULL THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_med_id USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 9. Calculate totals & finalize sale
  SELECT COALESCE(SUM(quantity * unit_price), 0), COALESCE(SUM(total_price), 0)
    INTO v_gross, v_net
    FROM public.sale_items
   WHERE sale_id = v_sale_id;

  v_subtotal := ROUND(v_gross, 2);
  IF v_sale_type = 'wholesale' THEN
    v_total := ROUND(v_net, 2);
  ELSE
    v_total := ROUND(v_subtotal * (1 - v_discount_percent / 100.0), 2);
  END IF;
  v_discount_amount := GREATEST(0, ROUND(v_subtotal - v_total, 2));

  UPDATE public.sales
     SET subtotal = v_subtotal,
         discount_percent = v_discount_percent,
         discount_amount = v_discount_amount,
         total = v_total
   WHERE id = v_sale_id;

  -- 10. High-discount approval flow handling
  IF v_pending THEN
    INSERT INTO public.admin_override_requests (
      pharmacy_id, requested_by, entity_type, entity_id, action, reason, status
    ) VALUES (
      v_pharmacy, v_user, 'sale', v_sale_id, 'high_discount',
      v_discount_percent::text || '% discount on ৳' || v_subtotal::text, 'pending'
    );

    INSERT INTO public.staff_activity_logs (
      pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, severity
    ) VALUES (
      v_pharmacy, v_user, 'discount_approval_requested', 'sale', v_sale_id,
      'Discount ' || v_discount_percent::text || '% exceeds shop limit ' || v_max_discount::text || '%',
      v_total, 'high_risk'
    );

    RETURN v_sale_id;
  END IF;

  -- 11. Record due customer ledger and cash transaction tagged with location_id
  IF v_payment_method IN ('due', 'split') AND v_customer_id IS NOT NULL THEN
    IF v_payment_method = 'split' THEN
      v_paid_now := GREATEST(0, LEAST(v_total, v_paid_now));
    ELSE
      v_paid_now := 0;
    END IF;
    v_due_amt := GREATEST(0, v_total - v_paid_now);

    IF v_due_amt > 0 THEN
      INSERT INTO public.customer_ledger (
        customer_id, pharmacy_id, location_id, user_id, entry_type, amount, description, sale_id
      ) VALUES (
        v_customer_id, v_pharmacy, v_location_id, v_user, 'due', v_due_amt,
        'Sale #' || substring(v_sale_id::text from 1 for 8), v_sale_id
      );
    END IF;

    IF v_payment_method = 'split' AND v_paid_now > 0 THEN
      INSERT INTO public.cash_transactions (
        pharmacy_id, location_id, user_id, direction, category, party_name, amount, sale_id
      ) VALUES (
        v_pharmacy, v_location_id, v_user, 'in', 'sale_cash', v_customer_name, v_paid_now, v_sale_id
      );
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb) TO authenticated;
