
-- 1. Create trigger to prevent role self-escalation
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Users cannot change their own role';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_role_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
WHEN (NEW.id = auth.uid())
EXECUTE FUNCTION public.prevent_role_change();

-- 2. Add DELETE policy for profiles
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (id = auth.uid());

-- 3. Fix permissive pharmacies INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert pharmacies" ON public.pharmacies;

CREATE POLICY "Users can insert pharmacies if they dont have one"
ON public.pharmacies
FOR INSERT
TO authenticated
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.pharmacy_id IS NOT NULL
  )
);
