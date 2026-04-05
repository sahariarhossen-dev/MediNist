
-- Fix: Restrict profiles INSERT to prevent setting arbitrary role or pharmacy_id
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (role IS NULL OR role = 'staff')
    AND pharmacy_id IS NULL
  );
