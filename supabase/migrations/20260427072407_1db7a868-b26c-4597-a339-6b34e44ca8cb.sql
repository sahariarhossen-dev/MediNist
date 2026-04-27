DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_ledger;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_closings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.cash_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.customer_ledger REPLICA IDENTITY FULL;
ALTER TABLE public.daily_closings REPLICA IDENTITY FULL;