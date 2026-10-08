-- Migration: Hierarchical RBAC for staff management (Owner > Manager > Salesman)

-- 1. Security definer function to manage staff suspension with strict hierarchy enforcement
CREATE OR REPLACE FUNCTION public.manage_staff_suspension(
  _user_id uuid,
  _is_suspended boolean,
  _suspend_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pharmacy uuid := public.get_user_pharmacy_id();
  v_caller_role text;
  v_caller_name text;
  v_target_role text;
  v_target_pharmacy uuid;
  v_target_name text;
  v_owner record;
  v_action_desc text;
BEGIN
  IF v_pharmacy IS NULL THEN
    RAISE EXCEPTION 'Not associated with any pharmacy' USING ERRCODE = '42501';
  END IF;

  -- Caller profile
  SELECT role, full_name INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can alter staff status' USING ERRCODE = '42501';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot alter your own suspension status' USING ERRCODE = '42501';
  END IF;

  -- Target profile
  SELECT role, pharmacy_id, full_name INTO v_target_role, v_target_pharmacy, v_target_name
  FROM public.profiles
  WHERE id = _user_id;

  IF v_target_pharmacy IS DISTINCT FROM v_pharmacy THEN
    RAISE EXCEPTION 'Target staff member does not belong to your shop' USING ERRCODE = 'P0002';
  END IF;

  -- Strict Hierarchy Guard:
  -- Managers can ONLY alter salesmen (strictly subordinate).
  -- A manager MUST NOT be able to alter other managers or the owner.
  IF v_caller_role = 'manager' THEN
    IF v_target_role IS DISTINCT FROM 'salesman' THEN
      RAISE EXCEPTION 'Managers can only suspend or reactivate staff with the salesman role' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Upsert staff_access
  INSERT INTO public.staff_access (
    pharmacy_id,
    user_id,
    is_suspended,
    suspended_at,
    suspend_reason,
    updated_by
  ) VALUES (
    v_pharmacy,
    _user_id,
    _is_suspended,
    CASE WHEN _is_suspended THEN now() ELSE NULL END,
    CASE WHEN _is_suspended THEN NULLIF(trim(_suspend_reason), '') ELSE NULL END,
    auth.uid()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_suspended = EXCLUDED.is_suspended,
    suspended_at = EXCLUDED.suspended_at,
    suspend_reason = EXCLUDED.suspend_reason,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  -- Also update shop_staff status if row exists
  UPDATE public.shop_staff
  SET
    status = CASE WHEN _is_suspended THEN 'suspended' ELSE 'active' END,
    is_suspended = _is_suspended
  WHERE pharmacy_id = v_pharmacy AND user_id = _user_id;

  v_action_desc := CASE 
    WHEN _is_suspended THEN 'Suspended access for salesman ' || COALESCE(v_target_name, 'Staff')
    ELSE 'Reactivated access for salesman ' || COALESCE(v_target_name, 'Staff')
  END;

  IF _suspend_reason IS NOT NULL AND trim(_suspend_reason) <> '' THEN
    v_action_desc := v_action_desc || ' (Reason: ' || trim(_suspend_reason) || ')';
  END IF;

  -- Audit log in staff_activity_logs
  INSERT INTO public.staff_activity_logs (
    pharmacy_id,
    user_id,
    action_type,
    entity_type,
    entity_id,
    description,
    severity
  ) VALUES (
    v_pharmacy,
    auth.uid(),
    CASE WHEN _is_suspended THEN 'staff_suspended' ELSE 'staff_reactivated' END,
    'profile',
    _user_id,
    COALESCE(v_caller_name, 'Staff') || ' (' || v_caller_role || '): ' || v_action_desc,
    'security'
  );

  -- When a manager suspends or reactivates a salesman, trigger an in-app audit/notification to the shop owner(s)
  IF v_caller_role = 'manager' THEN
    FOR v_owner IN 
      SELECT id FROM public.profiles 
      WHERE pharmacy_id = v_pharmacy AND role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        shop_id,
        pharmacy_id,
        user_id,
        title,
        message,
        type,
        metadata
      ) VALUES (
        v_pharmacy,
        v_pharmacy,
        v_owner.id,
        CASE WHEN _is_suspended THEN 'Staff Access Suspended' ELSE 'Staff Access Reactivated' END,
        'Manager ' || COALESCE(v_caller_name, 'Manager') || 
        CASE WHEN _is_suspended THEN ' suspended salesman ' ELSE ' reactivated salesman ' END || 
        COALESCE(v_target_name, 'Salesman') ||
        CASE WHEN _suspend_reason IS NOT NULL AND trim(_suspend_reason) <> '' THEN ' (Reason: ' || trim(_suspend_reason) || ')' ELSE '' END,
        'staff_suspension',
        jsonb_build_object(
          'actor_id', auth.uid(),
          'actor_name', v_caller_name,
          'actor_role', 'manager',
          'target_id', _user_id,
          'target_name', v_target_name,
          'target_role', 'salesman',
          'is_suspended', _is_suspended,
          'reason', _suspend_reason
        )
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'is_suspended', _is_suspended
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_staff_suspension(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_staff_suspension(uuid, boolean, text) TO authenticated;

-- 2. Allow managers to query staff_access for their shop
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'staff_access' AND policyname = 'staff_access_manager_select'
  ) THEN
    CREATE POLICY "staff_access_manager_select" ON public.staff_access
      FOR SELECT TO authenticated
      USING (
        pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin_or_manager()
      );
  END IF;
END;
$$;
