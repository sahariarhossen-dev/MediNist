-- ============================================================
-- staff_settings: per-staff performance config
-- ============================================================
CREATE TABLE public.staff_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  monthly_target numeric NOT NULL DEFAULT 0,
  commission_percent numeric NOT NULL DEFAULT 0,
  basic_salary numeric NOT NULL DEFAULT 0,
  advances numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, user_id)
);

ALTER TABLE public.staff_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy staff settings"
  ON public.staff_settings FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can insert staff settings"
  ON public.staff_settings FOR INSERT TO authenticated
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "Admins can update staff settings"
  ON public.staff_settings FOR UPDATE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "Admins can delete staff settings"
  ON public.staff_settings FOR DELETE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE TRIGGER staff_settings_touch
  BEFORE UPDATE ON public.staff_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_staff_settings_pharmacy ON public.staff_settings(pharmacy_id);
CREATE INDEX idx_staff_settings_user ON public.staff_settings(user_id);

-- ============================================================
-- pharmacy_broadcasts: simple notice board
-- ============================================================
CREATE TABLE public.pharmacy_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  message text NOT NULL,
  created_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacy_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pharmacy broadcasts"
  ON public.pharmacy_broadcasts FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can insert broadcasts"
  ON public.pharmacy_broadcasts FOR INSERT TO authenticated
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin() AND created_by = auth.uid());

CREATE POLICY "Admins can update broadcasts"
  ON public.pharmacy_broadcasts FOR UPDATE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin())
  WITH CHECK (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE POLICY "Admins can delete broadcasts"
  ON public.pharmacy_broadcasts FOR DELETE TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id() AND public.is_pharmacy_admin());

CREATE TRIGGER pharmacy_broadcasts_touch
  BEFORE UPDATE ON public.pharmacy_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_pharmacy_broadcasts_pharmacy_active
  ON public.pharmacy_broadcasts(pharmacy_id, is_active, created_at DESC);

-- ============================================================
-- RPC: get_pharmacy_staff_overview()
-- Returns staff list for the caller's pharmacy with monthly aggregates.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pharmacy_staff_overview()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  phone text,
  role text,
  month_sales numeric,
  month_count integer,
  monthly_target numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH ph AS (
    SELECT public.get_user_pharmacy_id() AS pid
  ), month_bounds AS (
    SELECT date_trunc('month', now()) AS start_ts,
           (date_trunc('month', now()) + interval '1 month' - interval '1 microsecond') AS end_ts
  )
  SELECT
    p.id AS user_id,
    p.full_name,
    p.avatar_url,
    p.phone,
    p.role,
    COALESCE(s.month_sales, 0) AS month_sales,
    COALESCE(s.month_count, 0)::int AS month_count,
    COALESCE(ss.monthly_target, 0) AS monthly_target
  FROM public.profiles p
  CROSS JOIN ph
  CROSS JOIN month_bounds mb
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(total), 0) AS month_sales,
           COUNT(*) AS month_count
    FROM public.sales
    WHERE pharmacy_id = ph.pid
      AND user_id = p.id
      AND status = 'completed'
      AND created_at >= mb.start_ts
      AND created_at <= mb.end_ts
  ) s ON true
  LEFT JOIN public.staff_settings ss
    ON ss.pharmacy_id = ph.pid AND ss.user_id = p.id
  WHERE p.pharmacy_id = ph.pid;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() FROM anon;

-- ============================================================
-- RPC: get_pharmacy_staff_profile(_user_id)
-- Returns one profile only if it belongs to the caller's pharmacy.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pharmacy_staff_profile(_user_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  phone text,
  role text,
  pharmacy_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.phone, p.role, p.pharmacy_id
  FROM public.profiles p
  WHERE p.id = _user_id
    AND p.pharmacy_id = public.get_user_pharmacy_id();
$$;

REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_profile(uuid) FROM anon;