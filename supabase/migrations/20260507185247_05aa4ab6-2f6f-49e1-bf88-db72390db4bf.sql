ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS last_popup_shown date;

UPDATE public.pharmacies
SET subscription_expiry = COALESCE(subscription_started_at, created_at, now()) + interval '30 days'
WHERE subscription_expiry IS NULL;