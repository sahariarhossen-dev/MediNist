CREATE TABLE public.master_medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  generic_name text,
  strength text,
  unit_price numeric DEFAULT 0,
  company text,
  format text,
  pack_size text,
  box_size text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.master_medicines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read master medicines"
  ON public.master_medicines FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "No client writes"
  ON public.master_medicines FOR INSERT
  TO authenticated WITH CHECK (false);

CREATE POLICY "No client updates"
  ON public.master_medicines FOR UPDATE
  TO authenticated USING (false);

CREATE POLICY "No client deletes"
  ON public.master_medicines FOR DELETE
  TO authenticated USING (false);