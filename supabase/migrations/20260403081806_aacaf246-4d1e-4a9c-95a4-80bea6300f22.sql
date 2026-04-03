
-- Prevent users from changing their own pharmacy_id (privilege escalation protection)
CREATE OR REPLACE FUNCTION public.prevent_pharmacy_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.pharmacy_id IS NOT NULL AND NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id THEN
    RAISE EXCEPTION 'Users cannot change their own pharmacy_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_pharmacy_id_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
WHEN (NEW.id = auth.uid())
EXECUTE FUNCTION public.prevent_pharmacy_id_change();
