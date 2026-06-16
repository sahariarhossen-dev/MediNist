
-- ============================================================
-- Phase 5: Atomic sale completion
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_sale(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pharmacy_id INTO v_pharmacy FROM public.profiles WHERE id = v_user;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'No pharmacy linked to your account' USING ERRCODE = '22023';
  END IF;

  v_draft_id        := NULLIF(_payload->>'draft_id','')::uuid;
  v_sale_type       := COALESCE(_payload->>'sale_type','retail');
  v_subtotal        := COALESCE((_payload->>'subtotal')::numeric, 0);
  v_discount_percent:= COALESCE((_payload->>'discount_percent')::numeric, 0);
  v_discount_amount := COALESCE((_payload->>'discount_amount')::numeric, 0);
  v_total           := COALESCE((_payload->>'total')::numeric, 0);
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
  IF v_subtotal < 0 OR v_total < 0 OR v_discount_amount < 0 THEN
    RAISE EXCEPTION 'Negative amounts are not allowed' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method NOT IN ('cash','due','split') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method IN ('due','split') AND v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer required for due/split payments' USING ERRCODE = '22023';
  END IF;

  -- Create or convert draft -> completed sale row
  IF v_draft_id IS NOT NULL THEN
    UPDATE public.sales
       SET sale_type = v_sale_type,
           subtotal = v_subtotal,
           discount_percent = v_discount_percent,
           discount_amount = v_discount_amount,
           total = v_total,
           status = 'completed'
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
      v_pharmacy, v_user, v_sale_type, v_subtotal,
      v_discount_percent, v_discount_amount, v_total, 'completed'
    ) RETURNING id INTO v_sale_id;
  END IF;

  -- Insert items + atomic, race-safe stock decrement
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
      COALESCE((v_item->>'discount_percent')::numeric, 0)
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

  -- Customer ledger (due portion) + optional split-cash entry
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
$$;

REVOKE ALL ON FUNCTION public.complete_sale(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb) TO authenticated;

-- ============================================================
-- Phase 6: Integrity guards
-- ============================================================

-- 6a. Non-negative stock backstop (trigger, not CHECK)
CREATE OR REPLACE FUNCTION public.tg_medicines_stock_nonnegative()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_quantity IS NOT NULL AND NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Stock cannot go negative for medicine %', NEW.id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS medicines_stock_nonnegative ON public.medicines;
CREATE TRIGGER medicines_stock_nonnegative
  BEFORE INSERT OR UPDATE OF stock_quantity ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.tg_medicines_stock_nonnegative();

-- 6b. Prevent duplicate cash_transactions per (sale_id, category)
CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_sale_category_unique
  ON public.cash_transactions (sale_id, category)
  WHERE sale_id IS NOT NULL;
