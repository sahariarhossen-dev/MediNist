
-- =========================================================
-- 1. Role taxonomy: allow admin / manager / salesman
-- =========================================================

-- Drop check constraints that block manager/salesman
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Migrate existing 'staff' rows to 'salesman' (admins stay)
UPDATE public.profiles SET role = 'salesman' WHERE role = 'staff' OR role IS NULL;

-- New constraint with full role set
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'salesman'));

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'salesman';

-- shop_staff already accepts manager/salesman by default; ensure default matches
ALTER TABLE public.shop_staff ALTER COLUMN role SET DEFAULT 'salesman';

-- Add a CHECK on shop_staff.role for the same set
ALTER TABLE public.shop_staff DROP CONSTRAINT IF EXISTS shop_staff_role_check;
ALTER TABLE public.shop_staff
  ADD CONSTRAINT shop_staff_role_check
  CHECK (role IN ('admin', 'manager', 'salesman'));

-- Update profiles INSERT policy: new self-signups can only insert with role salesman or NULL
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND (role IS NULL OR role = 'salesman')
  AND pharmacy_id IS NULL
);

-- Make handle_new_user insert with the new default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'salesman');
  RETURN NEW;
END;
$$;

-- =========================================================
-- 2. Let non-admin pharmacy members SELECT their own pharmacy
-- =========================================================
DROP POLICY IF EXISTS "Members can view own pharmacy" ON public.pharmacies;
CREATE POLICY "Members can view own pharmacy"
ON public.pharmacies
FOR SELECT
TO authenticated
USING (id = public.get_user_pharmacy_id());

-- =========================================================
-- 3. Lock down SECURITY DEFINER functions
-- =========================================================
-- Revoke from PUBLIC + anon for everything definer-y
REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pharmacy_admin()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_pharmacy_id()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_pharmacy_public()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_names()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_customer_total_due()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_pharmacy_id_change()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_messages_after_insert()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at()                   FROM PUBLIC, anon, authenticated;

-- Grant only what authed app needs
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_admin()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pharmacy_id()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pharmacy_public()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_member_names()           TO authenticated;

-- =========================================================
-- 4. Harden accept_staff_invitation (require verified, signed-in user)
-- =========================================================
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(_token uuid)
RETURNS TABLE(pharmacy_id uuid, role text, pharmacy_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.shop_staff%ROWTYPE;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_pharmacy_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT email, email_confirmed_at
    INTO v_user_email, v_email_confirmed_at
    FROM auth.users
    WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = '28000';
  END IF;

  IF v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Email not verified' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invite FROM public.shop_staff WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'Invitation email does not match the signed-in user' USING ERRCODE = '42501';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending (status: %)', v_invite.status USING ERRCODE = '22023';
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE public.shop_staff SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  IF v_invite.role NOT IN ('admin', 'manager', 'salesman') THEN
    RAISE EXCEPTION 'Invitation role % is not allowed', v_invite.role USING ERRCODE = '22023';
  END IF;

  -- Bypass guard triggers for this transaction only
  PERFORM set_config('app.bypass_profile_guards', 'on', true);

  UPDATE public.profiles
  SET pharmacy_id = v_invite.pharmacy_id,
      role = v_invite.role
  WHERE id = auth.uid();

  PERFORM set_config('app.bypass_profile_guards', 'off', true);

  UPDATE public.shop_staff
  SET status = 'accepted',
      user_id = auth.uid(),
      accepted_at = now()
  WHERE id = v_invite.id;

  SELECT name INTO v_pharmacy_name FROM public.pharmacies WHERE id = v_invite.pharmacy_id;

  RETURN QUERY SELECT v_invite.pharmacy_id, v_invite.role, v_pharmacy_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_staff_invitation(uuid) TO authenticated;

-- =========================================================
-- 5. Realtime hardening: remove notes from public publication
--    (the app does not currently subscribe to notes via realtime;
--     removing prevents cross-pharmacy leakage via channel subscriptions)
-- =========================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.notes';
  END IF;
END $$;
