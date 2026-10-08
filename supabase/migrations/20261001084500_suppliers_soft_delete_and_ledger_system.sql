-- ==============================================================================
-- Migration: Supplier Soft-Delete & Automated Ledger System
-- ==============================================================================

-- 1. Add soft-delete and opening balance columns to public.suppliers if not present
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'opening_balance'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN opening_balance numeric(14,2) NOT NULL DEFAULT 0.00;
  END IF;
END $$;

-- Partial index for active, non-deleted suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy_active_nondeleted
  ON public.suppliers(pharmacy_id, is_active)
  WHERE deleted_at IS NULL;

-- 2. Create the Supplier Ledger Entries Table (Double-entry accounting for payables)
CREATE TABLE IF NOT EXISTS public.supplier_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('opening_balance', 'bill', 'payment', 'return', 'adjustment')),
  description text,
  debit numeric(14,2) NOT NULL DEFAULT 0.00,   -- Reduces liability (payments made)
  credit numeric(14,2) NOT NULL DEFAULT 0.00,  -- Increases liability (bills/purchases)
  running_balance numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier 
  ON public.supplier_ledger_entries(supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_pharmacy 
  ON public.supplier_ledger_entries(pharmacy_id, created_at DESC);

-- 3. Row Level Security for Supplier Ledger Entries
ALTER TABLE public.supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "supplier_ledger_select_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_insert_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_update_policy" ON public.supplier_ledger_entries;
  DROP POLICY IF EXISTS "supplier_ledger_delete_policy" ON public.supplier_ledger_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "supplier_ledger_select_policy" ON public.supplier_ledger_entries
  FOR SELECT
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "supplier_ledger_insert_policy" ON public.supplier_ledger_entries
  FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "supplier_ledger_update_policy" ON public.supplier_ledger_entries
  FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "supplier_ledger_delete_policy" ON public.supplier_ledger_entries
  FOR DELETE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 4. Trigger Function: Automatically Recompute suppliers.balance From Ledger
CREATE OR REPLACE FUNCTION public.sync_supplier_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_supplier_id uuid;
  v_opening numeric(14,2);
  v_net_ledger numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_supplier_id := OLD.supplier_id;
  ELSE
    v_supplier_id := NEW.supplier_id;
  END IF;

  SELECT COALESCE(opening_balance, 0.00) INTO v_opening
  FROM public.suppliers
  WHERE id = v_supplier_id;

  SELECT COALESCE(SUM(credit - debit), 0.00) INTO v_net_ledger
  FROM public.supplier_ledger_entries
  WHERE supplier_id = v_supplier_id;

  UPDATE public.suppliers
  SET balance = COALESCE(v_opening, 0.00) + COALESCE(v_net_ledger, 0.00),
      updated_at = now()
  WHERE id = v_supplier_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_supplier_balance ON public.supplier_ledger_entries;

CREATE TRIGGER trg_sync_supplier_balance
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_balance();

-- Also trigger when opening_balance on suppliers is updated
CREATE OR REPLACE FUNCTION public.sync_supplier_opening_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_net_ledger numeric(14,2);
BEGIN
  IF OLD.opening_balance IS DISTINCT FROM NEW.opening_balance THEN
    SELECT COALESCE(SUM(credit - debit), 0.00) INTO v_net_ledger
    FROM public.supplier_ledger_entries
    WHERE supplier_id = NEW.id;

    NEW.balance := COALESCE(NEW.opening_balance, 0.00) + COALESCE(v_net_ledger, 0.00);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_supplier_opening_balance ON public.suppliers;

CREATE TRIGGER trg_sync_supplier_opening_balance
BEFORE UPDATE OF opening_balance ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_opening_balance();

-- 5. Trigger Function: Automatically Record Ledger Entry when Purchase Orders are Received
CREATE OR REPLACE FUNCTION public.trg_purchase_order_ledger_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- When a Purchase Order becomes 'received' or 'partial_received', log liability (credit)
  IF (NEW.status IN ('received', 'partial_received')) AND (OLD.status NOT IN ('received', 'partial_received')) THEN
    IF NEW.supplier_id IS NOT NULL AND NEW.total_amount > 0 THEN
      -- Check if bill entry already logged
      IF NOT EXISTS (
        SELECT 1 FROM public.supplier_ledger_entries 
        WHERE purchase_order_id = NEW.id AND transaction_type = 'bill'
      ) THEN
        INSERT INTO public.supplier_ledger_entries (
          pharmacy_id,
          supplier_id,
          purchase_order_id,
          transaction_type,
          description,
          debit,
          credit,
          created_by
        ) VALUES (
          NEW.pharmacy_id,
          NEW.supplier_id,
          NEW.id,
          'bill',
          'Purchase Order Received (PO #' || NEW.po_number || ')',
          0.00,
          NEW.total_amount,
          NEW.created_by
        );
      END IF;
    END IF;
  END IF;

  -- When a Purchase Order has payment recorded
  IF (NEW.paid_amount > OLD.paid_amount) AND (NEW.supplier_id IS NOT NULL) THEN
    DECLARE
      v_incremental_payment numeric(14,2) := NEW.paid_amount - OLD.paid_amount;
    BEGIN
      IF v_incremental_payment > 0 THEN
        INSERT INTO public.supplier_ledger_entries (
          pharmacy_id,
          supplier_id,
          purchase_order_id,
          transaction_type,
          description,
          debit,
          credit,
          created_by
        ) VALUES (
          NEW.pharmacy_id,
          NEW.supplier_id,
          NEW.id,
          'payment',
          'Payment for PO #' || NEW.po_number,
          v_incremental_payment,
          0.00,
          NEW.created_by
        );
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_po_ledger_sync ON public.purchase_orders;

CREATE TRIGGER trg_po_ledger_sync
AFTER UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_order_ledger_sync();
