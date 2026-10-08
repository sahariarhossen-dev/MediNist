-- Migration: 20260922000000_shop_locations_profile_fields.sql
-- Description: Add physical outlet profile and licensing fields to public.shop_locations
-- Ensures each branch location can maintain its own independent identity, contact info, licenses,
-- and invoice customization, while keeping public.pharmacies as the Mother Tenant (enterprise entity).

ALTER TABLE public.shop_locations
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS proprietor_name text,
  ADD COLUMN IF NOT EXISTS drug_license text,
  ADD COLUMN IF NOT EXISTS trade_license text,
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS default_discount numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text;

-- Backfill existing shop locations from public.pharmacies if fields are currently null
UPDATE public.shop_locations sl
SET 
  proprietor_name = COALESCE(sl.proprietor_name, p.proprietor_name),
  phone = COALESCE(NULLIF(sl.phone, ''), p.phone),
  email = COALESCE(sl.email, p.email),
  address = COALESCE(NULLIF(sl.address, ''), p.address),
  drug_license = COALESCE(sl.drug_license, p.drug_license),
  trade_license = COALESCE(sl.trade_license, p.trade_license),
  invoice_footer = COALESCE(sl.invoice_footer, p.invoice_footer),
  default_discount = COALESCE(sl.default_discount, p.default_discount),
  logo_url = COALESCE(sl.logo_url, p.logo_url),
  cover_url = COALESCE(sl.cover_url, p.cover_url)
FROM public.pharmacies p
WHERE sl.pharmacy_id = p.id;
