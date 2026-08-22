ALTER TABLE public.pharmacy_broadcasts
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS target_value text,
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tg_broadcasts_validate_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.target_type NOT IN ('all','role','user') THEN
    RAISE EXCEPTION 'Invalid target_type: %', NEW.target_type;
  END IF;
  IF NEW.target_type = 'all' THEN
    NEW.target_value := NULL;
  ELSE
    IF NEW.target_value IS NULL OR btrim(NEW.target_value) = '' THEN
      RAISE EXCEPTION 'target_value is required when target_type is %', NEW.target_type;
    END IF;
    IF NEW.target_type = 'role' AND NEW.target_value NOT IN ('admin','manager','salesman') THEN
      RAISE EXCEPTION 'Invalid target role: %', NEW.target_value;
    END IF;
    IF NEW.target_type = 'user' THEN
      PERFORM 1 FROM public.profiles p
        WHERE p.id = NEW.target_value::uuid AND p.pharmacy_id = NEW.pharmacy_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user is not a member of this pharmacy';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_broadcasts_validate_target ON public.pharmacy_broadcasts;
CREATE TRIGGER tg_broadcasts_validate_target
BEFORE INSERT OR UPDATE ON public.pharmacy_broadcasts
FOR EACH ROW EXECUTE FUNCTION public.tg_broadcasts_validate_target();

DROP POLICY IF EXISTS "Members can view pharmacy broadcasts" ON public.pharmacy_broadcasts;
CREATE POLICY "Members can view targeted broadcasts"
ON public.pharmacy_broadcasts
FOR SELECT
TO authenticated
USING (
  pharmacy_id = public.get_user_pharmacy_id()
  AND (
    public.is_pharmacy_admin()
    OR target_type = 'all'
    OR (target_type = 'user' AND target_value = auth.uid()::text)
    OR (target_type = 'role' AND target_value = (
          SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
       ))
  )
);