-- Admin-only staff role change (bypasses the self-role guard safely)
CREATE OR REPLACE FUNCTION public.admin_set_staff_role(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_profile_role text;
  v_target_pharmacy uuid;
BEGIN
  IF NOT public.is_pharmacy_admin() OR v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'Only shop owners can change staff roles' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('owner','manager','salesman') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;

  SELECT pharmacy_id INTO v_target_pharmacy FROM public.profiles WHERE id = _user_id;
  IF v_target_pharmacy IS DISTINCT FROM v_pharmacy THEN
    RAISE EXCEPTION 'Staff member not found in your pharmacy' USING ERRCODE = 'P0002';
  END IF;

  v_profile_role := CASE _role WHEN 'owner' THEN 'admin' WHEN 'manager' THEN 'manager' ELSE 'salesman' END;

  PERFORM set_config('app.bypass_profile_guards', 'on', true);
  UPDATE public.profiles SET role = v_profile_role, updated_at = now() WHERE id = _user_id;
  UPDATE public.shop_staff SET role = _role WHERE pharmacy_id = v_pharmacy AND user_id = _user_id;
  PERFORM set_config('app.bypass_profile_guards', 'off', true);

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description)
  VALUES (v_pharmacy, auth.uid(), 'staff_role_changed', 'profile', _user_id, 'Role changed to ' || _role);
END;
$$;

-- Admin-only staff removal: unlink from the pharmacy and close the invitation
CREATE OR REPLACE FUNCTION public.admin_remove_staff(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_target_pharmacy uuid;
BEGIN
  IF NOT public.is_pharmacy_admin() OR v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'Only shop owners can remove staff' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself' USING ERRCODE = '42501';
  END IF;

  SELECT pharmacy_id INTO v_target_pharmacy FROM public.profiles WHERE id = _user_id;
  IF v_target_pharmacy IS DISTINCT FROM v_pharmacy THEN
    RAISE EXCEPTION 'Staff member not found in your pharmacy' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.bypass_profile_guards', 'on', true);
  UPDATE public.profiles SET pharmacy_id = NULL, role = 'salesman', updated_at = now() WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_guards', 'off', true);

  UPDATE public.shop_staff SET status = 'removed', user_id = NULL
   WHERE pharmacy_id = v_pharmacy AND user_id = _user_id;

  DELETE FROM public.staff_access WHERE user_id = _user_id;
  DELETE FROM public.staff_permissions WHERE user_id = _user_id;

  INSERT INTO public.staff_activity_logs (pharmacy_id, user_id, action_type, entity_type, entity_id, description)
  VALUES (v_pharmacy, auth.uid(), 'staff_removed', 'profile', _user_id, 'Staff member removed from shop');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_staff_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_staff(uuid) TO authenticated;