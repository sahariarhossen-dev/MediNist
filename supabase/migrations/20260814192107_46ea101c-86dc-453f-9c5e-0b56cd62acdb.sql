CREATE OR REPLACE FUNCTION public.tg_sale_items_enforce_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pharmacy uuid;
  v_price numeric;
  v_disc numeric;
BEGIN
  SELECT pharmacy_id INTO v_pharmacy FROM public.sales WHERE id = NEW.sale_id;
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = '22023';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Item quantity must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(price, 0) INTO v_price
    FROM public.medicines
   WHERE id = NEW.medicine_id AND pharmacy_id = v_pharmacy;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDICINE_NOT_IN_PHARMACY:%', NEW.medicine_id USING ERRCODE = '22023';
  END IF;

  v_disc := LEAST(GREATEST(COALESCE(NEW.discount_percent, 0), 0), 100);
  NEW.discount_percent := v_disc;
  NEW.unit_price := ROUND(v_price, 2);
  NEW.total_price := ROUND(NEW.quantity * v_price * (1 - v_disc / 100.0), 2);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_sale_items_enforce_price() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_sale_items_enforce_price ON public.sale_items;
CREATE TRIGGER tg_sale_items_enforce_price
BEFORE INSERT OR UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.tg_sale_items_enforce_price();

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
  -- Only the sale-level discount percent is accepted from the client; every
  -- money amount is recomputed server-side from catalogue prices below.
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

  IF v_draft_id IS NOT NULL THEN
    UPDATE public.sales
       SET sale_type = v_sale_type,
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
      v_pharmacy, v_user, v_sale_type, 0, v_discount_percent, 0, 0, 'completed'
    ) RETURNING id INTO v_sale_id;
  END IF;

  -- Insert items + atomic, race-safe stock decrement.
  -- unit_price / total_price are overwritten by the sale_items price trigger.
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

  -- Authoritative totals from the stored (trigger-priced) sale items
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
GRANT EXECUTE ON FUNCTION public.complete_sale(jsonb) TO authenticated, service_role;