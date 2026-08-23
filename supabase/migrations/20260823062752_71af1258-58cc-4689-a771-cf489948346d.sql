-- ============ Migration B: approval workflows ============

-- 1. Soft-delete / pending-deletion state on medicines
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_by uuid;

CREATE INDEX IF NOT EXISTS medicines_pending_deletion_idx
  ON public.medicines (pharmacy_id) WHERE deletion_requested_at IS NOT NULL;

-- deletions only happen through the RPCs below
REVOKE DELETE ON public.medicines FROM authenticated;

-- 2. Discount ceiling settings
ALTER TABLE public.pharmacy_settings
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS require_discount_approval boolean NOT NULL DEFAULT true;

-- 3. Request a product deletion (owner deletes immediately)
CREATE OR REPLACE FUNCTION public.request_medicine_deletion(_medicine_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_name text;
  v_req uuid;
BEGIN
  IF v_user IS NULL OR v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF public.is_staff_suspended(v_user) THEN
    RAISE EXCEPTION 'ACCESS_SUSPENDED: Your access has been suspended by the shop owner' USING ERRCODE = '42501';
  END IF;
  IF public.is_staff_read_only(v_user) THEN
    RAISE EXCEPTION 'ACCESS_READ_ONLY: App blocked by shop owner' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_staff_permission(v_user, 'edit_inventory') THEN
    RAISE EXCEPTION 'NOT_PERMITTED: You cannot edit inventory' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM public.medicines
   WHERE id = _medicine_id AND pharmacy_id = v_pharmacy;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.is_pharmacy_admin() THEN
    DELETE FROM public.medicines WHERE id = _medicine_id AND pharmacy_id = v_pharmacy;
    RETURN jsonb_build_object('status', 'deleted');
  END IF;

  UPDATE public.medicines
     SET deletion_requested_at = now(), deletion_requested_by = v_user
   WHERE id = _medicine_id AND pharmacy_id = v_pharmacy;

  INSERT INTO public.admin_override_requests (
    pharmacy_id, requested_by, entity_type, entity_id, action, reason, status
  ) VALUES (
    v_pharmacy, v_user, 'medicine', _medicine_id, 'delete', NULLIF(_reason, ''), 'pending'
  ) RETURNING id INTO v_req;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, v_user, 'deletion_requested', 'medicine', _medicine_id,
          'Requested deletion of "' || v_name || '"', 'high_risk');

  RETURN jsonb_build_object('status', 'pending', 'request_id', v_req);
END;
$$;

REVOKE ALL ON FUNCTION public.request_medicine_deletion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_medicine_deletion(uuid, text) TO authenticated;

-- 4. Owner resolves a pending deletion
CREATE OR REPLACE FUNCTION public.resolve_medicine_deletion(_request_id uuid, _approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_med uuid;
  v_name text;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin() THEN
    RAISE EXCEPTION 'Only the shop owner can resolve this' USING ERRCODE = '42501';
  END IF;

  SELECT entity_id INTO v_med FROM public.admin_override_requests
   WHERE id = _request_id AND pharmacy_id = v_pharmacy
     AND entity_type = 'medicine' AND action = 'delete' AND status = 'pending';
  IF v_med IS NULL THEN
    RAISE EXCEPTION 'Request not found or already resolved' USING ERRCODE = 'P0002';
  END IF;

  SELECT name INTO v_name FROM public.medicines WHERE id = v_med;

  IF _approve THEN
    DELETE FROM public.medicines WHERE id = v_med AND pharmacy_id = v_pharmacy;
  ELSE
    UPDATE public.medicines
       SET deletion_requested_at = NULL, deletion_requested_by = NULL
     WHERE id = v_med AND pharmacy_id = v_pharmacy;
  END IF;

  UPDATE public.admin_override_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         resolved_by = auth.uid(),
         resolved_at = now()
   WHERE id = _request_id;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, auth.uid(),
          CASE WHEN _approve THEN 'deletion_approved' ELSE 'deletion_restored' END,
          'medicine', v_med,
          CASE WHEN _approve THEN 'Approved deletion of "' || COALESCE(v_name, 'product') || '"'
               ELSE 'Restored "' || COALESCE(v_name, 'product') || '"' END,
          'audit');

  RETURN jsonb_build_object('status', CASE WHEN _approve THEN 'deleted' ELSE 'restored' END);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_medicine_deletion(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_medicine_deletion(uuid, boolean) TO authenticated;

-- 5. complete_sale: read-only guard + high-discount approval queue
CREATE OR REPLACE FUNCTION public.complete_sale(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pharmacy uuid;
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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.is_staff_suspended(v_user) THEN
    RAISE EXCEPTION 'ACCESS_SUSPENDED: Your access has been suspended by the shop owner' USING ERRCODE = '42501';
  END IF;

  IF public.is_staff_read_only(v_user) THEN
    RAISE EXCEPTION 'ACCESS_READ_ONLY: App blocked by shop owner' USING ERRCODE = '42501';
  END IF;

  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy linked to your account' USING ERRCODE = '22023';
  END IF;

  v_draft_id        := NULLIF(_payload->>'draft_id','')::uuid;
  v_sale_type       := COALESCE(_payload->>'sale_type','retail');
  v_discount_percent:= LEAST(GREATEST(COALESCE((_payload->>'discount_percent')::numeric, 0), 0), 100);
  v_items           := _payload->'items';
  v_payment_method  := COALESCE(_payload#>>'{payment,method}','cash');
  v_paid_now        := COALESCE((_payload#>>'{payment,paid_now}')::numeric, 0);
  v_customer_id     := NULLIF(_payload#>>'{payment,customer_id}','')::uuid;
  v_customer_name   := _payload#>>'{payment,customer_name}';

  IF v_sale_type NOT IN ('retail','wholesale') THEN
    RAISE EXCEPTION 'Invalid sale_type' USING ERRCODE = '22023';
  END IF;
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one item' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method NOT IN ('cash','due','split') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method IN ('due','split') AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer required for due/split payments' USING ERRCODE = '22023';
  END IF;
  IF v_sale_type = 'wholesale' THEN
    v_discount_percent := 0;
  END IF;

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

  IF v_draft_id IS NOT NULL THEN
    UPDATE public.sales
       SET sale_type = v_sale_type,
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
      pharmacy_id, user_id, sale_type, subtotal,
      discount_percent, discount_amount, total, status
    ) VALUES (
      v_pharmacy, v_user, v_sale_type, 0, v_discount_percent, 0, 0,
      CASE WHEN v_pending THEN 'pending_approval' ELSE 'completed' END
    ) RETURNING id INTO v_sale_id;
  END IF;

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
      0,
      0,
      CASE WHEN v_sale_type = 'wholesale'
           THEN COALESCE((v_item->>'discount_percent')::numeric, 0)
           ELSE 0 END
    );

    UPDATE public.medicines
       SET stock_quantity = stock_quantity - v_qty
     WHERE id = v_med_id
       AND pharmacy_id = v_pharmacy
       AND COALESCE(stock_quantity, 0) >= v_qty
     RETURNING id INTO v_updated;

    IF v_updated IS NULL THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_med_id USING ERRCODE = '22023';
    END IF;
  END LOOP;

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

  IF v_pending THEN
    INSERT INTO public.admin_override_requests (
      pharmacy_id, requested_by, entity_type, entity_id, action, reason, status
    ) VALUES (
      v_pharmacy, v_user, 'sale', v_sale_id, 'high_discount',
      v_discount_percent::text || '% discount on ৳' || v_subtotal::text, 'pending'
    );

    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, severity)
    VALUES (v_pharmacy, v_user, 'discount_approval_requested', 'sale', v_sale_id,
            'Discount ' || v_discount_percent::text || '% exceeds shop limit ' || v_max_discount::text || '%',
            v_total, 'high_risk');

    RETURN v_sale_id;
  END IF;

  IF v_payment_method IN ('due','split') AND v_customer_id IS NOT NULL THEN
    IF v_payment_method = 'split' THEN
      v_paid_now := GREATEST(0, LEAST(v_total, v_paid_now));
    ELSE
      v_paid_now := 0;
    END IF;
    v_due_amt := GREATEST(0, v_total - v_paid_now);

    IF v_due_amt > 0 THEN
      INSERT INTO public.customer_ledger (
        customer_id, pharmacy_id, user_id, entry_type, amount, description, sale_id
      ) VALUES (
        v_customer_id, v_pharmacy, v_user, 'due', v_due_amt,
        'Sale #' || substring(v_sale_id::text from 1 for 8), v_sale_id
      );
    END IF;

    IF v_payment_method = 'split' AND v_paid_now > 0 THEN
      INSERT INTO public.cash_transactions (
        pharmacy_id, user_id, direction, category, party_name, amount, sale_id
      ) VALUES (
        v_pharmacy, v_user, 'in', 'sale_cash', v_customer_name, v_paid_now, v_sale_id
      );
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb) TO authenticated;

-- 6. Owner resolves a high-discount sale
CREATE OR REPLACE FUNCTION public.resolve_sale_discount(_request_id uuid, _approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_sale uuid;
  v_item record;
BEGIN
  IF v_pharmacy IS NULL OR NOT public.is_pharmacy_admin() THEN
    RAISE EXCEPTION 'Only the shop owner can resolve this' USING ERRCODE = '42501';
  END IF;

  SELECT entity_id INTO v_sale FROM public.admin_override_requests
   WHERE id = _request_id AND pharmacy_id = v_pharmacy
     AND entity_type = 'sale' AND action = 'high_discount' AND status = 'pending';
  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Request not found or already resolved' USING ERRCODE = 'P0002';
  END IF;

  IF _approve THEN
    UPDATE public.sales SET status = 'completed'
     WHERE id = v_sale AND pharmacy_id = v_pharmacy;
  ELSE
    FOR v_item IN SELECT medicine_id, quantity FROM public.sale_items WHERE sale_id = v_sale LOOP
      UPDATE public.medicines
         SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity
       WHERE id = v_item.medicine_id AND pharmacy_id = v_pharmacy;
    END LOOP;
    UPDATE public.sales SET status = 'voided'
     WHERE id = v_sale AND pharmacy_id = v_pharmacy;
  END IF;

  UPDATE public.admin_override_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         resolved_by = auth.uid(),
         resolved_at = now()
   WHERE id = _request_id;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, severity)
  VALUES (v_pharmacy, auth.uid(),
          CASE WHEN _approve THEN 'discount_approved' ELSE 'discount_rejected' END,
          'sale', v_sale,
          CASE WHEN _approve THEN 'Approved high discount sale' ELSE 'Rejected high discount sale, stock restored' END,
          CASE WHEN _approve THEN 'audit' ELSE 'high_risk' END);

  RETURN jsonb_build_object('status', CASE WHEN _approve THEN 'completed' ELSE 'voided' END);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_sale_discount(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sale_discount(uuid, boolean) TO authenticated;