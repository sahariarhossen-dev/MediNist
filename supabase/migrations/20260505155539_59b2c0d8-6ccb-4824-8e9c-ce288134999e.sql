ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS invoice_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_invoice_id_unique
  ON public.subscription_payments(invoice_id)
  WHERE invoice_id IS NOT NULL;