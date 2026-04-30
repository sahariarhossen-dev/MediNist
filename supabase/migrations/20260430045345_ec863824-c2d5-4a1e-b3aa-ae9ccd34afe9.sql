-- 1. Table
CREATE TABLE public.product_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  medicine_id uuid NOT NULL,
  medicine_name text NOT NULL,
  target_quantity integer NOT NULL CHECK (target_quantity > 0),
  current_progress integer NOT NULL DEFAULT 0,
  incentive_description text NOT NULL,
  target_month date NOT NULL,
  created_by uuid NOT NULL,
  achieved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_targets_unique_per_month
  ON public.product_targets (pharmacy_id, user_id, medicine_id, target_month);

CREATE INDEX product_targets_lookup
  ON public.product_targets (pharmacy_id, user_id, target_month);

ALTER TABLE public.product_targets ENABLE ROW LEVEL SECURITY;

-- 2. RLS
CREATE POLICY "Members can view pharmacy product targets"
  ON public.product_targets FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can insert product targets"
  ON public.product_targets FOR INSERT TO authenticated
  WITH CHECK (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin()
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins can update product targets"
  ON public.product_targets FOR UPDATE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "Admins can delete product targets"
  ON public.product_targets FOR DELETE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

-- 3. updated_at trigger
CREATE TRIGGER product_targets_touch_updated_at
  BEFORE UPDATE ON public.product_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Increment function — invoked by triggers
CREATE OR REPLACE FUNCTION public.increment_product_target_progress(
  _pharmacy_id uuid, _user_id uuid, _medicine_id uuid, _occurred_at timestamptz, _qty integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month date := date_trunc('month', _occurred_at)::date;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN RETURN; END IF;
  UPDATE public.product_targets
     SET current_progress = current_progress + _qty,
         achieved_at = CASE
           WHEN achieved_at IS NULL
            AND current_progress + _qty >= target_quantity
           THEN now()
           ELSE achieved_at
         END
   WHERE pharmacy_id = _pharmacy_id
     AND user_id = _user_id
     AND medicine_id = _medicine_id
     AND target_month = v_month;
END;
$$;

-- 5. Trigger on sale_items insert (only counts completed sales)
CREATE OR REPLACE FUNCTION public.tg_sale_item_increment_targets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = NEW.sale_id;
  IF NOT FOUND OR v_sale.status <> 'completed' THEN RETURN NEW; END IF;
  PERFORM public.increment_product_target_progress(
    v_sale.pharmacy_id, v_sale.user_id, NEW.medicine_id, v_sale.created_at, NEW.quantity
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER sale_items_increment_product_targets
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_sale_item_increment_targets();

-- 6. Trigger on sales status -> completed (backfill items)
CREATE OR REPLACE FUNCTION public.tg_sale_completed_backfill_targets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    FOR r IN
      SELECT medicine_id, SUM(quantity)::int AS qty
      FROM public.sale_items
      WHERE sale_id = NEW.id
      GROUP BY medicine_id
    LOOP
      PERFORM public.increment_product_target_progress(
        NEW.pharmacy_id, NEW.user_id, r.medicine_id, NEW.created_at, r.qty
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_completed_backfill_product_targets
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_sale_completed_backfill_targets();
