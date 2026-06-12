-- See /tmp/migration2.sql; inlining below
-- Snapshots for rollback
DROP TABLE IF EXISTS public._backup_master_pack_20260612;
DROP TABLE IF EXISTS public._backup_medicines_pack_20260612;
CREATE TABLE public._backup_master_pack_20260612 AS TABLE public.master_medicines;
CREATE TABLE public._backup_medicines_pack_20260612 AS TABLE public.medicines;

-- Replace catalog from authoritative JSON in a follow-up step.
-- This migration only creates the rollback snapshots and the staging
-- helpers; the bulk INSERTs are issued via the insert tool in a follow-up
-- because of size.
DROP TABLE IF EXISTS public._stg_medicines_new;
CREATE TABLE public._stg_medicines_new (
  brand_name text,
  generic_name text,
  strength text,
  unit_price numeric,
  company text,
  format text,
  pack_size text,
  box_size text,
  pcs_per_strip integer,
  strip_per_pack integer
);
GRANT ALL ON public._stg_medicines_new TO service_role;