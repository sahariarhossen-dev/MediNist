
-- 1. PRIVILEGE ESCALATION: attach guard triggers to profiles
DROP TRIGGER IF EXISTS profiles_prevent_role_change ON public.profiles;
CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();

DROP TRIGGER IF EXISTS profiles_prevent_pharmacy_id_change ON public.profiles;
CREATE TRIGGER profiles_prevent_pharmacy_id_change
  BEFORE UPDATE OF pharmacy_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pharmacy_id_change();

-- Simplify UPDATE policy on profiles; the trigger is now the real
-- enforcement for role/pharmacy_id immutability.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 2. SHOP_STAFF TOKEN EXPOSURE: rotate token on acceptance
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(_token uuid)
 RETURNS TABLE(pharmacy_id uuid, role text, pharmacy_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM set_config('app.bypass_profile_guards', 'on', true);

  UPDATE public.profiles
  SET pharmacy_id = v_invite.pharmacy_id,
      role = v_invite.role
  WHERE id = auth.uid();

  PERFORM set_config('app.bypass_profile_guards', 'off', true);

  -- Rotate token so the original link is no longer usable and the
  -- accepted row no longer leaks a valid invitation token.
  UPDATE public.shop_staff
  SET status = 'accepted',
      user_id = auth.uid(),
      accepted_at = now(),
      token = gen_random_uuid()
  WHERE id = v_invite.id;

  SELECT name INTO v_pharmacy_name FROM public.pharmacies WHERE id = v_invite.pharmacy_id;

  RETURN QUERY SELECT v_invite.pharmacy_id, v_invite.role, v_pharmacy_name;
END;
$function$;

-- Backfill: rotate tokens on already-accepted invitations
UPDATE public.shop_staff
SET token = gen_random_uuid()
WHERE status = 'accepted';

-- 3. SECURITY DEFINER EXECUTE GRANTS
REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pharmacy_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_pharmacy_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_pharmacy_public() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_names() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_pharmacy_id_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_customer_total_due() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_messages_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pharmacy_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pharmacy_public() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_member_names() TO authenticated;
