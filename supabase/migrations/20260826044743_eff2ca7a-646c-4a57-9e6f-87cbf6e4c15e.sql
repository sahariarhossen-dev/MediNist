-- 1. Threshold settings
ALTER TABLE public.pharmacy_settings
  ADD COLUMN IF NOT EXISTS large_cash_out_threshold numeric NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS closing_discrepancy_limit numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS price_drop_alert_percent numeric NOT NULL DEFAULT 20;

-- 2. Cash transaction logger reads the shop threshold
CREATE OR REPLACE FUNCTION public.log_cash_transaction_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_pharmacy uuid;
  v_amount numeric;
  v_entity_id uuid;
  v_dir text; v_cat text; v_party text;
  v_severity text := 'info';
  v_limit numeric;
BEGIN
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;
    v_action := 'transaction_create';
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.amount; v_entity_id := NEW.id;
    v_dir := NEW.direction; v_cat := NEW.category; v_party := NEW.party_name;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;
    v_action := 'transaction_update';
    v_severity := 'audit';
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.amount; v_entity_id := NEW.id;
    v_dir := NEW.direction; v_cat := NEW.category; v_party := NEW.party_name;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.sale_id IS NOT NULL THEN RETURN OLD; END IF;
    v_action := 'transaction_delete';
    v_severity := 'high_risk';
    v_pharmacy := OLD.pharmacy_id; v_amount := OLD.amount; v_entity_id := OLD.id;
    v_dir := OLD.direction; v_cat := OLD.category; v_party := OLD.party_name;
  END IF;

  SELECT COALESCE(large_cash_out_threshold, 5000) INTO v_limit
    FROM public.pharmacy_settings WHERE pharmacy_id = v_pharmacy;
  v_limit := COALESCE(v_limit, 5000);

  IF v_dir = 'out' AND v_severity = 'info' AND COALESCE(v_amount, 0) >= v_limit THEN
    v_severity := 'high_risk';
  ELSIF v_dir = 'out' AND v_severity = 'info' THEN
    v_severity := 'audit';
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, metadata, severity)
  VALUES (
    v_pharmacy, v_actor, v_action, 'cash_transaction', v_entity_id,
    (CASE v_action
      WHEN 'transaction_create' THEN 'Logged '
      WHEN 'transaction_update' THEN 'Edited '
      WHEN 'transaction_delete' THEN 'Deleted '
    END) || COALESCE(v_dir,'') || ' (' || COALESCE(v_cat,'') || ')'
      || CASE WHEN v_party IS NOT NULL AND v_party <> '' THEN ' — ' || v_party ELSE '' END
      || ' ৳' || v_amount::text,
    v_amount,
    jsonb_build_object('direction', v_dir, 'category', v_cat, 'party_name', v_party),
    v_severity
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Inventory update logging
CREATE OR REPLACE FUNCTION public.log_medicine_update_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_drop_pct numeric;
  v_old_price numeric := COALESCE(OLD.price, 0);
  v_new_price numeric := COALESCE(NEW.price, 0);
  v_old_stock int := COALESCE(OLD.stock_quantity, 0);
  v_new_stock int := COALESCE(NEW.stock_quantity, 0);
  v_from_sale boolean := false;
  v_severity text;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  -- Billing writes are flagged by complete_sale and never logged here
  IF COALESCE(current_setting('app.skip_inventory_log', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Price change
  IF v_old_price IS DISTINCT FROM v_new_price THEN
    SELECT COALESCE(price_drop_alert_percent, 20) INTO v_drop_pct
      FROM public.pharmacy_settings WHERE pharmacy_id = NEW.pharmacy_id;
    v_drop_pct := COALESCE(v_drop_pct, 20);
    v_severity := 'audit';
    IF v_old_price > 0 AND v_new_price < v_old_price
       AND ((v_old_price - v_new_price) / v_old_price) * 100 > v_drop_pct THEN
      v_severity := 'high_risk';
    END IF;

    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, metadata, severity)
    VALUES (
      NEW.pharmacy_id, v_actor, 'inventory_price_change', 'medicine', NEW.id,
      'Price changed on "' || COALESCE(NEW.name, 'Unnamed') || '": ৳' || v_old_price::text || ' -> ৳' || v_new_price::text,
      v_new_price,
      jsonb_build_object(
        'name', NEW.name,
        'changes', jsonb_build_array(jsonb_build_object('field', 'Price', 'old', '৳' || v_old_price::text, 'new', '৳' || v_new_price::text))
      ),
      v_severity
    );
  END IF;

  -- Stock change
  IF v_old_stock IS DISTINCT FROM v_new_stock THEN
    SELECT EXISTS (
      SELECT 1 FROM public.sale_items si
       WHERE si.medicine_id = NEW.id AND si.created_at > now() - interval '60 seconds'
    ) INTO v_from_sale;

    IF NOT v_from_sale THEN
      v_severity := CASE WHEN v_new_stock < v_old_stock THEN 'high_risk' ELSE 'audit' END;
      INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, metadata, severity)
      VALUES (
        NEW.pharmacy_id, v_actor, 'inventory_stock_adjust', 'medicine', NEW.id,
        'Stock ' || CASE WHEN v_new_stock < v_old_stock THEN 'reduced' ELSE 'increased' END
          || ' on "' || COALESCE(NEW.name, 'Unnamed') || '": ' || v_old_stock::text || ' -> ' || v_new_stock::text
          || CASE WHEN v_new_stock < v_old_stock THEN ' (no matching sale)' ELSE '' END,
        jsonb_build_object(
          'name', NEW.name,
          'changes', jsonb_build_array(jsonb_build_object('field', 'Stock', 'old', v_old_stock::text, 'new', v_new_stock::text))
        ),
        v_severity
      );
    END IF;
  END IF;

  -- Other detail edits
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    v_changes := v_changes || jsonb_build_object('field', 'Name', 'old', OLD.name, 'new', NEW.name);
  END IF;
  IF OLD.expiry_date IS DISTINCT FROM NEW.expiry_date THEN
    v_changes := v_changes || jsonb_build_object('field', 'Expiry', 'old', OLD.expiry_date::text, 'new', NEW.expiry_date::text);
  END IF;
  IF OLD.company_name IS DISTINCT FROM NEW.company_name THEN
    v_changes := v_changes || jsonb_build_object('field', 'Company', 'old', OLD.company_name, 'new', NEW.company_name);
  END IF;
  IF OLD.pcs_per_strip IS DISTINCT FROM NEW.pcs_per_strip THEN
    v_changes := v_changes || jsonb_build_object('field', 'Pcs / strip', 'old', OLD.pcs_per_strip::text, 'new', NEW.pcs_per_strip::text);
  END IF;
  IF OLD.strip_per_pack IS DISTINCT FROM NEW.strip_per_pack THEN
    v_changes := v_changes || jsonb_build_object('field', 'Strips / pack', 'old', OLD.strip_per_pack::text, 'new', NEW.strip_per_pack::text);
  END IF;

  IF jsonb_array_length(v_changes) > 0 THEN
    INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, metadata, severity)
    VALUES (
      NEW.pharmacy_id, v_actor, 'inventory_edit', 'medicine', NEW.id,
      'Edited product "' || COALESCE(NEW.name, 'Unnamed') || '"',
      jsonb_build_object('name', NEW.name, 'changes', v_changes),
      'audit'
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_log_medicine_update ON public.medicines;
CREATE TRIGGER tg_log_medicine_update
AFTER UPDATE ON public.medicines
FOR EACH ROW EXECUTE FUNCTION public.log_medicine_update_activity();

-- 4. Ledger logging for every entry type + edits/deletes
CREATE OR REPLACE FUNCTION public.log_customer_ledger_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_severity text;
  v_desc text;
  v_pharmacy uuid;
  v_amount numeric;
  v_entity uuid;
  v_meta jsonb;
BEGIN
  IF v_actor IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.amount; v_entity := NEW.id;
    IF NEW.entry_type = 'payment' THEN
      v_action := 'payment_received'; v_severity := 'info';
      v_desc := 'Received customer payment of ৳' || NEW.amount::text;
    ELSIF NEW.entry_type = 'due' THEN
      v_action := 'due_added'; v_severity := 'info';
      v_desc := 'Added customer due of ৳' || NEW.amount::text;
    ELSE
      v_action := 'due_adjusted'; v_severity := 'audit';
      v_desc := 'Ledger ' || NEW.entry_type || ' of ৳' || NEW.amount::text;
    END IF;
    v_meta := jsonb_build_object('entry_type', NEW.entry_type, 'customer_id', NEW.customer_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_pharmacy := NEW.pharmacy_id; v_amount := NEW.amount; v_entity := NEW.id;
    IF OLD.amount IS NOT DISTINCT FROM NEW.amount AND OLD.entry_type IS NOT DISTINCT FROM NEW.entry_type THEN
      RETURN NEW;
    END IF;
    v_action := 'due_adjusted'; v_severity := 'audit';
    v_desc := 'Edited ledger entry: ৳' || COALESCE(OLD.amount, 0)::text || ' -> ৳' || COALESCE(NEW.amount, 0)::text;
    v_meta := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'changes', jsonb_build_array(
        jsonb_build_object('field', 'Amount', 'old', '৳' || COALESCE(OLD.amount, 0)::text, 'new', '৳' || COALESCE(NEW.amount, 0)::text),
        jsonb_build_object('field', 'Type', 'old', OLD.entry_type, 'new', NEW.entry_type)
      )
    );
  ELSE
    v_pharmacy := OLD.pharmacy_id; v_amount := OLD.amount; v_entity := OLD.id;
    v_action := 'due_written_off'; v_severity := 'high_risk';
    v_desc := 'Deleted ledger entry (' || OLD.entry_type || ') of ৳' || COALESCE(OLD.amount, 0)::text;
    v_meta := jsonb_build_object('entry_type', OLD.entry_type, 'customer_id', OLD.customer_id);
  END IF;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description, amount, metadata, severity)
  VALUES (v_pharmacy, v_actor, v_action, 'customer_ledger', v_entity, v_desc, v_amount, v_meta, v_severity);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_customer_ledger_activity ON public.customer_ledger;
CREATE TRIGGER trg_log_customer_ledger_activity
AFTER INSERT OR UPDATE OR DELETE ON public.customer_ledger
FOR EACH ROW EXECUTE FUNCTION public.log_customer_ledger_activity();