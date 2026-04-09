
-- Helper function: check if current user is admin of their pharmacy
CREATE OR REPLACE FUNCTION public.is_pharmacy_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper function: get current user's pharmacy_id
CREATE OR REPLACE FUNCTION public.get_user_pharmacy_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pharmacy_id FROM profiles WHERE id = auth.uid();
$$;

-- ============ SHOP_STAFF ============
DROP POLICY IF EXISTS "Staff accessible by pharmacy members" ON shop_staff;

CREATE POLICY "Members can view pharmacy staff"
  ON shop_staff FOR SELECT
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Admins can insert staff"
  ON shop_staff FOR INSERT
  TO authenticated
  WITH CHECK (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin()
  );

CREATE POLICY "Admins can update staff"
  ON shop_staff FOR UPDATE
  TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin()
  )
  WITH CHECK (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin()
  );

CREATE POLICY "Admins can delete staff"
  ON shop_staff FOR DELETE
  TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin()
  );

-- ============ SALES ============
DROP POLICY IF EXISTS "Users can access their pharmacy sales" ON sales;

CREATE POLICY "Members can view pharmacy sales"
  ON sales FOR SELECT
  TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());

CREATE POLICY "Members can create sales"
  ON sales FOR INSERT
  TO authenticated
  WITH CHECK (
    pharmacy_id = public.get_user_pharmacy_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "Creator or admin can update sales"
  ON sales FOR UPDATE
  TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND (user_id = auth.uid() OR public.is_pharmacy_admin())
  );

CREATE POLICY "Admins can delete sales"
  ON sales FOR DELETE
  TO authenticated
  USING (
    pharmacy_id = public.get_user_pharmacy_id()
    AND public.is_pharmacy_admin()
  );

-- ============ SALE_ITEMS ============
DROP POLICY IF EXISTS "Users can access their pharmacy sale items" ON sale_items;

CREATE POLICY "Members can view pharmacy sale items"
  ON sale_items FOR SELECT
  TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM sales WHERE pharmacy_id = public.get_user_pharmacy_id()
    )
  );

CREATE POLICY "Members can create sale items"
  ON sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    sale_id IN (
      SELECT id FROM sales WHERE pharmacy_id = public.get_user_pharmacy_id()
    )
  );

CREATE POLICY "Creator or admin can update sale items"
  ON sale_items FOR UPDATE
  TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM sales
      WHERE pharmacy_id = public.get_user_pharmacy_id()
        AND (user_id = auth.uid() OR public.is_pharmacy_admin())
    )
  );

CREATE POLICY "Admins can delete sale items"
  ON sale_items FOR DELETE
  TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM sales
      WHERE pharmacy_id = public.get_user_pharmacy_id()
        AND public.is_pharmacy_admin()
    )
  );
