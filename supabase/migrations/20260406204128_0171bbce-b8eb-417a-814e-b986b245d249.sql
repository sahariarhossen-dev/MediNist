-- Remove the overly permissive INSERT policy on pharmacies
-- Pharmacy creation is handled exclusively by the register-pharmacy edge function
-- which uses the service role key (bypasses RLS), so this client-side policy is unnecessary
DROP POLICY IF EXISTS "Users can insert pharmacies if they dont have one" ON public.pharmacies;