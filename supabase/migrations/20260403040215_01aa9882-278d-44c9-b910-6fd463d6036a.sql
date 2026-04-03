ALTER TABLE public.medicines
ADD COLUMN product_type text,
ADD COLUMN product_size text,
ADD COLUMN strip_per_pack integer,
ADD COLUMN pcs_per_strip integer,
ADD COLUMN stock_alert integer DEFAULT 0;