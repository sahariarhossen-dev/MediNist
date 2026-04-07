-- Add new columns to pharmacies
ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS drug_license text,
  ADD COLUMN IF NOT EXISTS trade_license text,
  ADD COLUMN IF NOT EXISTS invoice_footer text;

-- Create shop_staff table
CREATE TABLE shop_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'salesman',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(pharmacy_id, email)
);

ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff accessible by pharmacy members"
  ON shop_staff FOR ALL TO authenticated
  USING (pharmacy_id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));

-- Add UPDATE policy to pharmacies
CREATE POLICY "Pharmacy admins can update their pharmacy"
  ON pharmacies FOR UPDATE TO authenticated
  USING (id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (id = (SELECT pharmacy_id FROM profiles WHERE id = auth.uid()));

-- Create pharmacy-assets storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('pharmacy-assets', 'pharmacy-assets', true);

-- Storage policies for pharmacy-assets
CREATE POLICY "Pharmacy assets are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pharmacy-assets');

CREATE POLICY "Authenticated users can upload pharmacy assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pharmacy-assets');

CREATE POLICY "Authenticated users can update pharmacy assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pharmacy-assets');

CREATE POLICY "Authenticated users can delete pharmacy assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pharmacy-assets');