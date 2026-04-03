
-- Create sales table
CREATE TABLE public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sale_type text NOT NULL DEFAULT 'retail',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 10,
  discount_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create sale_items table
CREATE TABLE public.sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  medicine_id uuid NOT NULL,
  medicine_name text NOT NULL,
  company_name text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Sales RLS: users can access sales belonging to their pharmacy
CREATE POLICY "Users can access their pharmacy sales"
ON public.sales
FOR ALL
USING (pharmacy_id = (SELECT profiles.pharmacy_id FROM profiles WHERE profiles.id = auth.uid()));

-- Sale items RLS: users can access items for sales in their pharmacy
CREATE POLICY "Users can access their pharmacy sale items"
ON public.sale_items
FOR ALL
USING (sale_id IN (SELECT s.id FROM public.sales s WHERE s.pharmacy_id = (SELECT profiles.pharmacy_id FROM profiles WHERE profiles.id = auth.uid())));

-- Indexes
CREATE INDEX idx_sales_pharmacy_id ON public.sales(pharmacy_id);
CREATE INDEX idx_sales_status ON public.sales(status);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
