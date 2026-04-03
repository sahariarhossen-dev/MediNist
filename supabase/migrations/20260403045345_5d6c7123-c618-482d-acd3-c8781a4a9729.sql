CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pharmacy_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their pharmacy companies"
  ON public.companies FOR ALL
  USING (pharmacy_id = (SELECT profiles.pharmacy_id FROM profiles WHERE profiles.id = auth.uid()));