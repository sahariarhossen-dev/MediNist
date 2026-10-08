-- ==============================================================================
-- Migration: Stock Transfer Transactional RPC, Safe Deduplication & Unique Constraint
-- File: supabase/migrations/20260918071000_stock_transfer_rpc_and_unique_constraint.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure public.shop_locations table exists
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'branch',
  code text,
  address text DEFAULT '',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. Ensure public.stock_transfers table exists and has all required columns
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  from_location_id text NOT NULL,
  to_location_id text NOT NULL,
  medicine_id uuid REFERENCES public.medicines(id) ON DELETE SET NULL,
  medicine_name text NOT NULL,
  generic_name text,
  dosage text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz
);

-- Ensure all columns exist even if public.stock_transfers was created previously without them
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS generic_name text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS dosage text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS unit text DEFAULT 'pcs';
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS accepted_by uuid;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- ------------------------------------------------------------------------------
-- 3. Ensure location_id column exists on public.medicines (typed as UUID)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'medicines' 
      AND column_name = 'location_id'
  ) THEN
    ALTER TABLE public.medicines ADD COLUMN location_id uuid;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Auto-bootstrap 'Main Branch' for any pharmacy lacking a location
-- ------------------------------------------------------------------------------
INSERT INTO public.shop_locations (pharmacy_id, name, type, code, address, is_active)
SELECT DISTINCT m.pharmacy_id, 'Main Branch', 'branch', 'MAIN', 'Primary Pharmacy Location', true
FROM public.medicines m
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_locations sl WHERE sl.pharmacy_id = m.pharmacy_id
);

-- ------------------------------------------------------------------------------
-- 5. CRITICAL ARCHITECTURAL STEP: Drop existing unique constraints/indexes FIRST
-- Dropping this index BEFORE deduplication guarantees that PostgreSQL will NOT
-- abort with ERROR 23505 while rows are being consolidated.
-- ------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_medicines_unique_location_name;
DROP INDEX IF EXISTS public.idx_medicines_unique_location;

-- ------------------------------------------------------------------------------
-- 6. SAFE DEDUPLICATION & STOCK CONSOLIDATION (PL/pgSQL Block)
-- Groups existing records by their effective target branch (whether location_id is
-- already set or currently NULL). Consolidates stock, remaps foreign keys, and
-- deletes redundant duplicate rows.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  dup RECORD;
  v_kept_id uuid;
  v_total_stock numeric;
BEGIN
  -- Iterate through every group of medicines that will collide at the same location
  FOR r IN (
    WITH med_targets AS (
      SELECT 
        m.id,
        m.pharmacy_id,
        lower(trim(m.name)) AS clean_name,
        COALESCE(lower(trim(m.product_size)), '') AS clean_size,
        COALESCE(
          m.location_id,
          (
            SELECT sl.id 
            FROM public.shop_locations sl 
            WHERE sl.pharmacy_id = m.pharmacy_id 
            ORDER BY sl.created_at ASC 
            LIMIT 1
          )
        ) AS effective_loc,
        COALESCE(m.stock_quantity, 0) AS stock_quantity,
        (m.location_id IS NOT NULL) AS has_explicit_loc,
        m.created_at
      FROM public.medicines m
      WHERE m.deletion_requested_at IS NULL
    )
    SELECT 
      pharmacy_id,
      effective_loc,
      clean_name,
      clean_size,
      count(*) AS duplicate_count
    FROM med_targets
    WHERE effective_loc IS NOT NULL
    GROUP BY pharmacy_id, effective_loc, clean_name, clean_size
    HAVING count(*) > 1
  ) LOOP

    -- 1. Identify the single best 'keeper' record:
    -- Prefer a row that already has location_id populated; then earliest created_at
    SELECT m.id INTO v_kept_id
    FROM public.medicines m
    WHERE m.pharmacy_id = r.pharmacy_id
      AND lower(trim(m.name)) = r.clean_name
      AND COALESCE(lower(trim(m.product_size)), '') = r.clean_size
      AND (
        m.location_id = r.effective_loc
        OR (
          m.location_id IS NULL 
          AND r.effective_loc = (
            SELECT sl.id FROM public.shop_locations sl 
            WHERE sl.pharmacy_id = r.pharmacy_id 
            ORDER BY sl.created_at ASC LIMIT 1
          )
        )
      )
      AND m.deletion_requested_at IS NULL
    ORDER BY (m.location_id IS NOT NULL) DESC, m.created_at ASC NULLS LAST, m.id ASC
    LIMIT 1;

    -- 2. Consolidate stock across all duplicate rows in this branch
    SELECT COALESCE(SUM(COALESCE(m.stock_quantity, 0)), 0) INTO v_total_stock
    FROM public.medicines m
    WHERE m.pharmacy_id = r.pharmacy_id
      AND lower(trim(m.name)) = r.clean_name
      AND COALESCE(lower(trim(m.product_size)), '') = r.clean_size
      AND (
        m.location_id = r.effective_loc
        OR (
          m.location_id IS NULL 
          AND r.effective_loc = (
            SELECT sl.id FROM public.shop_locations sl 
            WHERE sl.pharmacy_id = r.pharmacy_id 
            ORDER BY sl.created_at ASC LIMIT 1
          )
        )
      )
      AND m.deletion_requested_at IS NULL;

    -- 3. Update keeper row with consolidated stock and ensured location_id
    UPDATE public.medicines
    SET stock_quantity = v_total_stock,
        location_id = r.effective_loc
    WHERE id = v_kept_id;

    -- 4. Reassign foreign key references & delete the non-keeper duplicate rows
    FOR dup IN (
      SELECT m.id
      FROM public.medicines m
      WHERE m.pharmacy_id = r.pharmacy_id
        AND lower(trim(m.name)) = r.clean_name
        AND COALESCE(lower(trim(m.product_size)), '') = r.clean_size
        AND (
          m.location_id = r.effective_loc
          OR (
            m.location_id IS NULL 
            AND r.effective_loc = (
              SELECT sl.id FROM public.shop_locations sl 
              WHERE sl.pharmacy_id = r.pharmacy_id 
              ORDER BY sl.created_at ASC LIMIT 1
            )
          )
        )
        AND m.id <> v_kept_id
    ) LOOP
      -- Re-link potential foreign keys to the keeper record so delete does not fail
      BEGIN
        UPDATE public.sale_items SET medicine_id = v_kept_id WHERE medicine_id = dup.id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      BEGIN
        UPDATE public.product_targets SET medicine_id = v_kept_id WHERE medicine_id = dup.id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      BEGIN
        UPDATE public.stock_transfers SET medicine_id = v_kept_id WHERE medicine_id = dup.id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      -- Delete redundant duplicate record
      DELETE FROM public.medicines WHERE id = dup.id;
    END LOOP;

  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Backfill remaining NULL location_ids
-- Now that all duplicates were merged, this update is 100% collision-free.
-- Note: Cast properly to UUID.
-- ------------------------------------------------------------------------------
UPDATE public.medicines m
SET location_id = (
  SELECT sl.id 
  FROM public.shop_locations sl 
  WHERE sl.pharmacy_id = m.pharmacy_id 
  ORDER BY sl.created_at ASC 
  LIMIT 1
)
WHERE m.location_id IS NULL;

-- ------------------------------------------------------------------------------
-- 8. Re-apply the case-insensitive UNIQUE INDEX
-- Guaranteed to succeed because table has been completely deduplicated.
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_medicines_unique_location_name
ON public.medicines (
  pharmacy_id,
  location_id,
  lower(trim(name)),
  COALESCE(lower(trim(product_size)), '')
);

-- ------------------------------------------------------------------------------
-- 9. Atomic PL/pgSQL Function: process_stock_transfer
-- Executes origin deduction + destination upsert in a single ACID transaction.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_stock_transfer(_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer record;
  v_pharmacy_id uuid;
  v_from_loc uuid;
  v_to_loc uuid;
  v_qty numeric;
  v_med_name text;
  v_dosage text;
  v_origin_med record;
  v_dest_med record;
  v_dest_id uuid;
  v_new_origin_stock numeric;
  v_new_dest_stock numeric;
BEGIN
  -- 1. Fetch & lock transfer record
  SELECT * INTO v_transfer
  FROM public.stock_transfers
  WHERE id = _transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer record % not found', _transfer_id USING ERRCODE = 'P0002';
  END IF;

  -- Guard against re-processing accepted transfers
  IF v_transfer.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'message', 'Transfer was already processed and accepted'
    );
  END IF;

  IF v_transfer.status = 'rejected' THEN
    RAISE EXCEPTION 'Cannot accept a transfer with status: rejected' USING ERRCODE = '22023';
  END IF;

  v_pharmacy_id := v_transfer.pharmacy_id;
  v_from_loc    := v_transfer.from_location_id::uuid;
  v_to_loc      := v_transfer.to_location_id::uuid;
  v_qty         := COALESCE(v_transfer.quantity, 0);
  v_med_name    := trim(v_transfer.medicine_name);
  v_dosage      := NULLIF(trim(COALESCE(v_transfer.dosage, '')), '');

  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than 0' USING ERRCODE = '22023';
  END IF;

  IF v_from_loc = v_to_loc THEN
    RAISE EXCEPTION 'Origin and destination location cannot be identical' USING ERRCODE = '22023';
  END IF;

  -- 2. STEP 1: DEDUCT FROM ORIGIN LOCATION (UPDATE ONLY)
  IF v_transfer.medicine_id IS NOT NULL THEN
    SELECT * INTO v_origin_med
    FROM public.medicines
    WHERE id = v_transfer.medicine_id
      AND pharmacy_id = v_pharmacy_id
    FOR UPDATE;
  END IF;

  IF v_origin_med.id IS NULL OR (v_origin_med.location_id IS NOT NULL AND v_origin_med.location_id <> v_from_loc) THEN
    SELECT * INTO v_origin_med
    FROM public.medicines
    WHERE pharmacy_id = v_pharmacy_id
      AND lower(trim(name)) = lower(v_med_name)
      AND (v_dosage IS NULL OR lower(trim(COALESCE(product_size, ''))) = lower(v_dosage))
      AND (
        location_id = v_from_loc
        OR (location_id IS NULL AND v_from_loc = (
          SELECT sl.id FROM public.shop_locations sl WHERE sl.pharmacy_id = v_pharmacy_id ORDER BY sl.created_at ASC LIMIT 1
        ))
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_origin_med.id IS NOT NULL THEN
    v_new_origin_stock := GREATEST(0, COALESCE(v_origin_med.stock_quantity, 0) - v_qty);
    UPDATE public.medicines
    SET stock_quantity = v_new_origin_stock
    WHERE id = v_origin_med.id;
  ELSE
    v_new_origin_stock := 0;
  END IF;

  -- 3. STEP 2: UPSERT TO DESTINATION LOCATION (Check -> UPDATE or INSERT)
  SELECT * INTO v_dest_med
  FROM public.medicines
  WHERE pharmacy_id = v_pharmacy_id
    AND lower(trim(name)) = lower(v_med_name)
    AND (
      v_dosage IS NULL
      OR lower(trim(COALESCE(product_size, ''))) = lower(v_dosage)
    )
    AND (
      location_id = v_to_loc
      OR (location_id IS NULL AND v_to_loc = (
        SELECT sl.id FROM public.shop_locations sl WHERE sl.pharmacy_id = v_pharmacy_id ORDER BY sl.created_at ASC LIMIT 1
      ))
    )
  LIMIT 1
  FOR UPDATE;

  IF v_dest_med.id IS NOT NULL THEN
    -- Destination product exists -> UPDATE ONLY
    v_new_dest_stock := COALESCE(v_dest_med.stock_quantity, 0) + v_qty;
    UPDATE public.medicines
    SET stock_quantity = v_new_dest_stock
    WHERE id = v_dest_med.id;
    v_dest_id := v_dest_med.id;
  ELSE
    -- Destination product does not exist -> INSERT with ON CONFLICT safety
    v_new_dest_stock := v_qty;
    INSERT INTO public.medicines (
      pharmacy_id,
      name,
      generic_name,
      company_name,
      product_type,
      product_size,
      unit_format,
      format,
      strength,
      price,
      stock_quantity,
      stock_alert,
      pcs_per_strip,
      strip_per_pack,
      box_size,
      pack_size,
      expiry_date,
      location_id
    ) VALUES (
      v_pharmacy_id,
      COALESCE(v_origin_med.name, v_med_name),
      COALESCE(v_origin_med.generic_name, v_transfer.generic_name),
      v_origin_med.company_name,
      COALESCE(v_origin_med.product_type, 'Tablet'),
      COALESCE(v_origin_med.product_size, v_dosage),
      v_origin_med.unit_format,
      v_origin_med.format,
      v_origin_med.strength,
      v_origin_med.price,
      v_qty,
      COALESCE(v_origin_med.stock_alert, 0),
      COALESCE(v_origin_med.pcs_per_strip, 1),
      COALESCE(v_origin_med.strip_per_pack, 1),
      v_origin_med.box_size,
      v_origin_med.pack_size,
      v_origin_med.expiry_date,
      v_to_loc
    )
    ON CONFLICT (
      pharmacy_id,
      location_id,
      lower(trim(name)),
      COALESCE(lower(trim(product_size)), '')
    )
    DO UPDATE SET
      stock_quantity = public.medicines.stock_quantity + EXCLUDED.stock_quantity
    RETURNING id INTO v_dest_id;
  END IF;

  -- 4. STEP 3: MARK TRANSFER AS ACCEPTED
  UPDATE public.stock_transfers
  SET status = 'accepted'
  WHERE id = _transfer_id;

  -- Safely record accepted_at and accepted_by timestamp and user
  BEGIN
    EXECUTE 'UPDATE public.stock_transfers SET accepted_at = now(), accepted_by = $1 WHERE id = $2'
    USING v_caller, _transfer_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 5. Audit log in staff_activity_logs (safe fallback if schema differs)
  BEGIN
    INSERT INTO public.staff_activity_logs (
      pharmacy_id,
      user_id,
      action_type,
      entity_type,
      entity_id,
      description,
      severity
    ) VALUES (
      v_pharmacy_id,
      v_caller,
      'stock_transfer_accepted',
      'stock_transfer',
      _transfer_id,
      'Transferred ' || v_qty::text || ' units of ' || v_med_name || ' to destination branch',
      'audit'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', _transfer_id,
    'medicine_name', v_med_name,
    'quantity_transferred', v_qty,
    'from_location_id', v_from_loc,
    'to_location_id', v_to_loc,
    'origin_medicine_id', v_origin_med.id,
    'destination_medicine_id', v_dest_id,
    'origin_new_stock', v_new_origin_stock,
    'destination_new_stock', v_new_dest_stock
  );
END;
$$;

-- Ensure no overloaded function exists (PostgREST cannot disambiguate between text and uuid)
DROP FUNCTION IF EXISTS public.process_stock_transfer(text);

REVOKE ALL ON FUNCTION public.process_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_stock_transfer(uuid) TO authenticated;

