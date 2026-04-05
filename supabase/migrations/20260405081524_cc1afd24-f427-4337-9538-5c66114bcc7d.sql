
-- 1. Fix pharmacies: remove anonymous public read access
DROP POLICY IF EXISTS "Anyone can view pharmacies" ON pharmacies;

CREATE POLICY "Pharmacy users can view their own pharmacy"
  ON pharmacies FOR SELECT
  TO authenticated
  USING (
    id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid())
  );

-- 2. Fix profiles: prevent role self-elevation
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND pharmacy_id IS NOT DISTINCT FROM (SELECT p.pharmacy_id FROM profiles p WHERE p.id = auth.uid())
  );
