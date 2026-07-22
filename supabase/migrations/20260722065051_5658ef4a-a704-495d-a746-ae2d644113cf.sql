
CREATE OR REPLACE FUNCTION public.tg_cash_transactions_prevent_negative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starting numeric := 0;
  v_sales numeric := 0;
  v_dues numeric := 0;
  v_cash_in numeric := 0;
  v_due_recv numeric := 0;
  v_payments numeric := 0;
  v_available numeric := 0;
BEGIN
  -- Only guard outgoing entries
  IF NEW.direction <> 'out' THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Starting cash balance (pharmacy_settings)
  SELECT COALESCE(starting_cash_balance, 0) INTO v_starting
  FROM public.pharmacy_settings
  WHERE pharmacy_id = NEW.pharmacy_id;
  v_starting := COALESCE(v_starting, 0);

  -- Completed sales strictly before this transaction
  SELECT COALESCE(SUM(total), 0) INTO v_sales
  FROM public.sales
  WHERE pharmacy_id = NEW.pharmacy_id
    AND status = 'completed'
    AND created_at < NEW.occurred_at;

  -- New dues booked before this transaction
  SELECT COALESCE(SUM(amount), 0) INTO v_dues
  FROM public.customer_ledger
  WHERE pharmacy_id = NEW.pharmacy_id
    AND entry_type = 'due'
    AND occurred_at < NEW.occurred_at;

  -- Cash transactions strictly before this one
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in'  AND category = 'other_in'        THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'in'  AND category = 'due_collection'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out'                                   THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_due_recv, v_payments
  FROM public.cash_transactions
  WHERE pharmacy_id = NEW.pharmacy_id
    AND occurred_at < NEW.occurred_at;

  v_available := v_starting + GREATEST(0, v_sales - v_dues) + v_due_recv + v_cash_in - v_payments;

  IF NEW.amount > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_CASH: Cash in Hand cannot go negative. Available: ৳%, requested: ৳%',
      round(v_available, 2), round(NEW.amount, 2)
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_transactions_prevent_negative_balance ON public.cash_transactions;
CREATE TRIGGER trg_cash_transactions_prevent_negative_balance
  BEFORE INSERT ON public.cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_cash_transactions_prevent_negative();
