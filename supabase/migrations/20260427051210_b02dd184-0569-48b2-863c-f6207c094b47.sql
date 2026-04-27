
-- Update the trigger guard functions to allow updates when a session-local
-- flag is set. The accept_staff_invitation SECURITY DEFINER function will
-- set this flag before updating the profile.

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.bypass_profile_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Users cannot change their own role';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_pharmacy_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.bypass_profile_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.pharmacy_id IS NOT NULL AND NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id THEN
    RAISE EXCEPTION 'Users cannot change their own pharmacy_id';
  END IF;
  RETURN NEW;
END;
$function$;

-- Rewrite accept_staff_invitation to use the new bypass flag instead of
-- session_replication_role (which requires superuser privileges).
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(_token uuid)
RETURNS TABLE(pharmacy_id uuid, role text, pharmacy_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite public.shop_staff%ROWTYPE;
  v_user_email text;
  v_pharmacy_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = '28000';
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
$function$;
