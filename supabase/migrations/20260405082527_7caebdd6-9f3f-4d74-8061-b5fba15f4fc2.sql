
-- Fix: Change policies on medicines, companies, sales, sale_items from public to authenticated

-- medicines
DROP POLICY IF EXISTS "Users can only access their pharmacy data" ON medicines;
CREATE POLICY "Users can only access their pharmacy data"
  ON medicines FOR ALL
  TO authenticated
  USING (pharmacy_id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));

-- companies
DROP POLICY IF EXISTS "Users can access their pharmacy companies" ON companies;
CREATE POLICY "Users can access their pharmacy companies"
  ON companies FOR ALL
  TO authenticated
  USING (pharmacy_id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));

-- sales
DROP POLICY IF EXISTS "Users can access their pharmacy sales" ON sales;
CREATE POLICY "Users can access their pharmacy sales"
  ON sales FOR ALL
  TO authenticated
  USING (pharmacy_id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));

-- sale_items
DROP POLICY IF EXISTS "Users can access their pharmacy sale items" ON sale_items;
CREATE POLICY "Users can access their pharmacy sale items"
  ON sale_items FOR ALL
  TO authenticated
  USING (sale_id IN (SELECT s.id FROM sales s WHERE s.pharmacy_id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid())));
