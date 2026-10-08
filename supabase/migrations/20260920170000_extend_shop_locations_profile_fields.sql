-- Migration: 20260920170000_extend_shop_locations_profile_fields.sql
-- Description: Add branch-specific identity and profile fields to public.shop_locations
-- This enables each branch/godown to maintain its own independent identity, contact info, licenses, invoice notes, and branding.

ALTER TABLE public.shop_locations
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS proprietor_name text,
  ADD COLUMN IF NOT EXISTS drug_license text,
  ADD COLUMN IF NOT EXISTS trade_license text,
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS default_discount numeric DEFAULT 10;
