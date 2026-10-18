import { supabase } from "@/integrations/supabase/client";
import { processAcceptTransfer } from "@/lib/stockTransferService";

// Utility to check if a Supabase PostgREST error is due to an undeployed or cached table
export const isMissingTableError = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
};

export interface SupplierRecord {
  id: string;
  pharmacy_id: string;
  location_id?: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: "cash" | "net_15" | "net_30" | "net_60" | "credit" | "advance";
  balance: number;
  opening_balance?: number;
  order_days?: number[];
  lead_time_days?: number;
  minimum_order_amount?: number;
  sr_name?: string | null;
  sr_phone?: string | null;
  sr_whatsapp?: string | null;
  is_active: boolean;
  deleted_at?: string | null;
  created_at: string;
}

export interface RequisitionRecord {
  id: string;
  pharmacy_id: string;
  location_id?: string | null;
  supplier_id: string;
  requisition_number: string;
  status: "draft" | "shared" | "confirmed" | "converted_to_po" | "cancelled";
  scheduled_order_day?: number | null;
  total_estimated_amount: number;
  notes?: string | null;
  created_by?: string | null;
  converted_po_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequisitionItemRecord {
  id: string;
  requisition_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  generic_name?: string | null;
  company_name?: string | null;
  current_stock_pcs: number;
  reorder_level_pcs: number;
  suggested_qty_pcs: number;
  final_order_qty_pcs: number;
  pack_mode: "box" | "strip" | "piece";
  boxes_to_order: number;
  strips_to_order: number;
  pieces_per_box: number;
  pcs_per_strip: number;
  strip_per_pack: number;
  estimated_trade_price: number;
  estimated_line_total: number;
  created_at: string;
}

export interface RequisitionMagicLinkRecord {
  id: string;
  requisition_id: string;
  pharmacy_id: string;
  supplier_id: string;
  token: string;
  expires_at: string;
  access_count: number;
  last_accessed_at?: string | null;
  is_revoked: boolean;
  sr_acknowledged_at?: string | null;
  sr_estimated_delivery?: string | null;
  sr_notes?: string | null;
  created_at: string;
}

export interface SmartRequisitionSuggestionItem {
  medicine_id: string;
  medicine_name: string;
  generic_name: string | null;
  company_name: string | null;
  current_stock_pcs: number;
  reorder_level_pcs: number;
  suggested_qty_pcs: number;
  strip_per_pack: number;
  pcs_per_strip: number;
  pieces_per_box: number;
  estimated_tp: number;
}

export interface SmartRequisitionSupplierSuggestion {
  supplier_id: string;
  supplier_name: string;
  sr_name: string | null;
  sr_phone: string | null;
  sr_whatsapp: string | null;
  order_days: number[];
  is_scheduled_today: boolean;
  short_items_count: number;
  total_estimated_value: number;
  items: SmartRequisitionSuggestionItem[];
}

export interface SupplierLedgerRecord {
  id: string;
  pharmacy_id: string;
  location_id?: string | null;
  supplier_id: string;
  purchase_order_id?: string | null;
  transaction_type: "opening_balance" | "bill" | "payment" | "return" | "adjustment";
  description?: string | null;
  debit: number;
  credit: number;
  running_balance?: number;
  created_at: string;
  created_by?: string | null;
}

export interface PurchaseOrderItemRecord {
  id: string;
  purchase_order_id: string;
  medicine_id: string | null;
  medicine_name: string;
  order_quantity: number;
  unit_cost: number;
  total_cost: number;
  received_quantity?: number | null;
}

export interface PurchaseOrderRecord {
  id: string;
  pharmacy_id: string;
  warehouse_id: string;
  supplier_id: string;
  po_number: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  total_amount: number;
  notes: string | null;
  order_date: string;
  expected_date: string | null;
  received_at: string | null;
  received_by: string | null;
  created_at: string;
  supplier?: SupplierRecord;
  items?: PurchaseOrderItemRecord[];
}

export interface BranchRequisitionItemRecord {
  id: string;
  requisition_id: string;
  medicine_id: string | null;
  medicine_name: string;
  requested_quantity: number;
  requested_qty?: number;
  pack_unit?: string;
  approved_quantity: number | null;
  dispatched_qty?: number | null;
  notes: string | null;
}

export interface BranchRequisitionRecord {
  id: string;
  pharmacy_id: string;
  from_branch_id?: string | null;
  to_warehouse_id?: string | null;
  from_location_id?: string;
  to_location_id?: string;
  requisition_number: string;
  status: string;
  priority?: "low" | "normal" | "urgent";
  urgency?: "low" | "normal" | "urgent";
  notes: string | null;
  created_at: string;
  items?: BranchRequisitionItemRecord[];
}

export interface StockAuditItemRecord {
  id: string;
  audit_id: string;
  medicine_id: string;
  medicine_name: string;
  system_quantity: number;
  counted_quantity: number;
  variance_quantity: number;
  adjustment_reason: string;
}

export interface StockAuditRecord {
  id: string;
  pharmacy_id: string;
  location_id: string;
  audit_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  items?: StockAuditItemRecord[];
}

// Helper to safely read and write localStorage
const readLocal = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
};

const writeLocal = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota limits
  }
};

export const warehouseStorage = {
  // ==========================================
  // 1. SUPPLIERS & LEDGER
  // ==========================================
  async getSuppliers(pharmacyId: string, branchId?: string): Promise<SupplierRecord[]> {
    if (!pharmacyId || typeof pharmacyId !== "string" || !pharmacyId.trim()) {
      return [];
    }

    const storageKey = branchId
      ? `warehouse_suppliers_${pharmacyId}_${branchId}`
      : `warehouse_suppliers_${pharmacyId}`;

    try {
      let query = (supabase.from("suppliers" as any) as any)
        .select("*")
        .eq("pharmacy_id", pharmacyId)
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (branchId) {
        // Return suppliers scoped to this specific branch or pharmacy-wide (location_id is null)
        query = query.or(`location_id.eq.${branchId},location_id.is.null`);
      }

      const { data, error } = await query;

      if (error) {
        console.warn("[warehouseStorage] Supabase getSuppliers warning:", error.message);
        if (isMissingTableError(error)) {
          // Fall back gracefully to local storage if table is missing, strictly scoped to this pharmacy
          const local = readLocal<SupplierRecord[]>(storageKey, []);
          return local.filter((s) => s.pharmacy_id === pharmacyId && !s.deleted_at);
        }
      } else if (Array.isArray(data)) {
        // Legitimate response from Supabase (including empty array [] for an isolated newly registered pharmacy)
        writeLocal(storageKey, data);
        return data as SupplierRecord[];
      }
    } catch (err: any) {
      if (!isMissingTableError(err)) {
        console.warn("[warehouseStorage] Unexpected suppliers fetch error:", err);
      }
    }

    // Offline / Network Error Fallback: return cached local data strictly matching pharmacyId
    const local = readLocal<SupplierRecord[]>(storageKey, []);
    return local.filter((s) => s.pharmacy_id === pharmacyId && !s.deleted_at);
  },

  async saveSupplier(
    pharmacyId: string,
    supplier: Partial<SupplierRecord>,
    branchId?: string
  ): Promise<SupplierRecord> {
    const storageKey = branchId
      ? `warehouse_suppliers_${pharmacyId}_${branchId}`
      : `warehouse_suppliers_${pharmacyId}`;
    const ledgerKey = branchId
      ? `warehouse_supplier_ledger_${pharmacyId}_${branchId}`
      : `warehouse_supplier_ledger_${pharmacyId}`;
    let saved: SupplierRecord | null = null;
    const initialOpening = Number(supplier.opening_balance ?? supplier.balance ?? 0);
    const targetLocationId = supplier.location_id || branchId || null;

    // Optimistic Supabase try
    try {
      if (supplier.id && !supplier.id.startsWith("sup_seed_") && !supplier.id.startsWith("sup_loc_")) {
        const updatePayload: any = {
          name: supplier.name,
          contact_person: supplier.contact_person,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          payment_terms: supplier.payment_terms,
          is_active: supplier.is_active ?? true,
          order_days: supplier.order_days ?? [],
          lead_time_days: supplier.lead_time_days ?? 1,
          minimum_order_amount: supplier.minimum_order_amount ?? 0,
          sr_name: supplier.sr_name ?? null,
          sr_phone: supplier.sr_phone ?? null,
          sr_whatsapp: supplier.sr_whatsapp ?? null,
        };

        if (targetLocationId) {
          updatePayload.location_id = targetLocationId;
        }

        // If opening_balance is provided, update it (the trigger will recompute balance)
        if (supplier.opening_balance !== undefined) {
          updatePayload.opening_balance = initialOpening;
        }

        const { data, error } = await (supabase.from("suppliers" as any) as any)
          .update(updatePayload)
          .eq("id", supplier.id)
          .select()
          .single();

        if (!error && data) {
          saved = data as SupplierRecord;
        }
      } else {
        const { data, error } = await (supabase.from("suppliers" as any) as any)
          .insert({
            pharmacy_id: pharmacyId,
            location_id: targetLocationId,
            name: supplier.name,
            contact_person: supplier.contact_person,
            phone: supplier.phone,
            email: supplier.email,
            address: supplier.address,
            payment_terms: supplier.payment_terms || "net_30",
            opening_balance: initialOpening,
            balance: initialOpening,
            is_active: true,
            deleted_at: null,
            order_days: supplier.order_days ?? [],
            lead_time_days: supplier.lead_time_days ?? 1,
            minimum_order_amount: supplier.minimum_order_amount ?? 0,
            sr_name: supplier.sr_name ?? null,
            sr_phone: supplier.sr_phone ?? null,
            sr_whatsapp: supplier.sr_whatsapp ?? null,
          })
          .select()
          .single();

        if (!error && data) {
          saved = data as SupplierRecord;

          // If initial opening balance > 0, log opening ledger entry strictly scoped to branch
          if (initialOpening > 0 && saved?.id) {
            try {
              await (supabase.from("supplier_ledger_entries" as any) as any).insert({
                pharmacy_id: pharmacyId,
                location_id: targetLocationId,
                supplier_id: saved.id,
                transaction_type: "opening_balance",
                description: "Initial Account Payable Balance",
                debit: 0,
                credit: initialOpening,
              });
            } catch {
              // Ledger table might be migrating
            }
          }
        }
      }
    } catch {
      // Ignored for missing table
    }

    // Always sync local storage
    const current = readLocal<SupplierRecord[]>(storageKey, []);
    if (!saved) {
      if (supplier.id) {
        saved = {
          ...(current.find((s) => s.id === supplier.id) as SupplierRecord),
          ...supplier,
          location_id: targetLocationId,
          balance: Number(supplier.balance ?? supplier.opening_balance ?? 0),
        } as SupplierRecord;
        const updated = current.map((s) => (s.id === supplier.id ? saved! : s));
        writeLocal(storageKey, updated);
      } else {
        const newId = `sup_loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        saved = {
          id: newId,
          pharmacy_id: pharmacyId,
          location_id: targetLocationId,
          name: supplier.name || "Unnamed Supplier",
          contact_person: supplier.contact_person || null,
          phone: supplier.phone || null,
          email: supplier.email || null,
          address: supplier.address || null,
          payment_terms: supplier.payment_terms || "net_30",
          opening_balance: initialOpening,
          balance: initialOpening,
          is_active: true,
          deleted_at: null,
          order_days: supplier.order_days ?? [],
          lead_time_days: supplier.lead_time_days ?? 1,
          minimum_order_amount: supplier.minimum_order_amount ?? 0,
          sr_name: supplier.sr_name ?? null,
          sr_phone: supplier.sr_phone ?? null,
          sr_whatsapp: supplier.sr_whatsapp ?? null,
          created_at: new Date().toISOString(),
        };
        writeLocal(storageKey, [saved, ...current]);

        // Local ledger record for opening balance
        if (initialOpening > 0) {
          const localLedger = readLocal<SupplierLedgerRecord[]>(ledgerKey, []);
          localLedger.unshift({
            id: `ledg_${Date.now()}`,
            pharmacy_id: pharmacyId,
            location_id: targetLocationId,
            supplier_id: newId,
            transaction_type: "opening_balance",
            description: "Initial Account Payable Balance",
            debit: 0,
            credit: initialOpening,
            running_balance: initialOpening,
            created_at: new Date().toISOString(),
          });
          writeLocal(ledgerKey, localLedger);
        }
      }
    } else {
      const idx = current.findIndex((s) => s.id === saved!.id);
      if (idx >= 0) {
        current[idx] = saved;
        writeLocal(storageKey, current);
      } else {
        writeLocal(storageKey, [saved, ...current]);
      }
    }

    return saved;
  },

  async deleteSupplier(pharmacyId: string, supplierId: string, branchId?: string): Promise<void> {
    const storageKey = branchId
      ? `warehouse_suppliers_${pharmacyId}_${branchId}`
      : `warehouse_suppliers_${pharmacyId}`;
    const nowIso = new Date().toISOString();
    try {
      // TARGET ARCHITECTURE: SOFT DELETE
      // Preserve historical accounting & purchase orders by marking is_active = false and deleted_at = now()
      const { error } = await (supabase.from("suppliers" as any) as any)
        .update({
          is_active: false,
          deleted_at: nowIso,
        })
        .eq("id", supplierId);

      if (error) {
        console.warn("[warehouseStorage] Supabase soft delete error, trying hard delete fallback:", error.message);
        await (supabase.from("suppliers" as any) as any)
          .delete()
          .eq("id", supplierId);
      }
    } catch (err) {
      console.warn("[warehouseStorage] Soft delete exception:", err);
    }

    // Always update local cache: soft delete by filtering out of active list
    const current = readLocal<SupplierRecord[]>(storageKey, []);
    writeLocal(
      storageKey,
      current.filter((s) => s.id !== supplierId)
    );
    if (branchId) {
      const globalKey = `warehouse_suppliers_${pharmacyId}`;
      const globalCurrent = readLocal<SupplierRecord[]>(globalKey, []);
      writeLocal(
        globalKey,
        globalCurrent.filter((s) => s.id !== supplierId)
      );
    }
  },

  // ==========================================
  // 1B. SUPPLIER LEDGER & PAYMENTS
  // ==========================================
  async getSupplierLedger(
    pharmacyId: string,
    supplierId: string,
    branchId?: string
  ): Promise<SupplierLedgerRecord[]> {
    const ledgerKey = branchId
      ? `warehouse_supplier_ledger_${pharmacyId}_${branchId}`
      : `warehouse_supplier_ledger_${pharmacyId}`;
    try {
      let query = (supabase.from("supplier_ledger_entries" as any) as any)
        .select("*")
        .eq("supplier_id", supplierId);

      if (branchId) {
        query = query.eq("location_id", branchId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        writeLocal(ledgerKey, data);
        return data as SupplierLedgerRecord[];
      }
    } catch {
      // Fall back to local
    }

    const localLedger = readLocal<SupplierLedgerRecord[]>(ledgerKey, []);
    return localLedger.filter((l) => l.supplier_id === supplierId && (!branchId || !l.location_id || l.location_id === branchId));
  },

  async recordSupplierLedgerEntry(
    pharmacyId: string,
    supplierId: string,
    entry: {
      transaction_type: "bill" | "payment" | "return" | "adjustment";
      amount: number;
      description?: string;
      purchase_order_id?: string;
    },
    branchId?: string
  ): Promise<void> {
    const isPaymentOrReturn = entry.transaction_type === "payment" || entry.transaction_type === "return";
    const debit = isPaymentOrReturn ? entry.amount : 0;
    const credit = isPaymentOrReturn ? 0 : entry.amount;

    try {
      await (supabase.from("supplier_ledger_entries" as any) as any).insert({
        pharmacy_id: pharmacyId,
        location_id: branchId || null,
        supplier_id: supplierId,
        purchase_order_id: entry.purchase_order_id || null,
        transaction_type: entry.transaction_type,
        description: entry.description || null,
        debit,
        credit,
      });
    } catch (err) {
      console.warn("[warehouseStorage] Error saving ledger entry to Supabase:", err);
    }

    // Always update local cache and supplier balance
    const ledgerKey = branchId
      ? `warehouse_supplier_ledger_${pharmacyId}_${branchId}`
      : `warehouse_supplier_ledger_${pharmacyId}`;
    const localLedger = readLocal<SupplierLedgerRecord[]>(ledgerKey, []);
    localLedger.unshift({
      id: `ledg_${Date.now()}`,
      pharmacy_id: pharmacyId,
      location_id: branchId || null,
      supplier_id: supplierId,
      purchase_order_id: entry.purchase_order_id || null,
      transaction_type: entry.transaction_type,
      description: entry.description || null,
      debit,
      credit,
      created_at: new Date().toISOString(),
    });
    writeLocal(ledgerKey, localLedger);

    // Sync supplier balance in local storage
    const storageKey = branchId
      ? `warehouse_suppliers_${pharmacyId}_${branchId}`
      : `warehouse_suppliers_${pharmacyId}`;
    const currentSuppliers = readLocal<SupplierRecord[]>(storageKey, []);
    const supIndex = currentSuppliers.findIndex((s) => s.id === supplierId);
    if (supIndex >= 0) {
      const currentSup = currentSuppliers[supIndex];
      const delta = credit - debit;
      currentSup.balance = Math.max(0, (Number(currentSup.balance) || 0) + delta);
      currentSuppliers[supIndex] = currentSup;
      writeLocal(storageKey, currentSuppliers);
    }
  },

  // ==========================================
  // 2. PURCHASE ORDERS & GRN
  // ==========================================
  async getPurchaseOrders(pharmacyId: string, branchLocationId?: string): Promise<PurchaseOrderRecord[]> {
    const storageKey = branchLocationId
      ? `warehouse_pos_${pharmacyId}_${branchLocationId}`
      : `warehouse_pos_${pharmacyId}`;
    try {
      let query = (supabase.from("purchase_orders" as any) as any)
        .select(`
          *,
          supplier:suppliers(*),
          items:purchase_order_items(*)
        `)
        .eq("pharmacy_id", pharmacyId);

      if (branchLocationId) {
        query = query.or(`warehouse_id.eq.${branchLocationId},warehouse_id.is.null`);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          return readLocal<PurchaseOrderRecord[]>(storageKey, []);
        }
        console.warn("[warehouseStorage] Supabase getPurchaseOrders warning:", error.message);
      } else if (Array.isArray(data)) {
        writeLocal(storageKey, data);
        return data as PurchaseOrderRecord[];
      }
    } catch (err: any) {
      if (!isMissingTableError(err)) {
        console.warn("[warehouseStorage] Unexpected POs fetch error:", err);
      }
    }

    return readLocal<PurchaseOrderRecord[]>(storageKey, []);
  },

  async savePurchaseOrder(
    pharmacyId: string,
    po: Partial<PurchaseOrderRecord>,
    items: Partial<PurchaseOrderItemRecord>[]
  ): Promise<PurchaseOrderRecord> {
    const storageKey = `warehouse_pos_${pharmacyId}`;
    let savedPo: PurchaseOrderRecord | null = null;

    // Try Supabase first
    try {
      const { data: newPo, error: poErr } = await (
        supabase.from("purchase_orders" as any) as any
      )
        .insert({
          pharmacy_id: pharmacyId,
          warehouse_id: po.warehouse_id,
          supplier_id: po.supplier_id,
          po_number: po.po_number,
          status: po.status || "draft",
          total_amount: po.total_amount || 0,
          notes: po.notes || null,
          order_date: po.order_date || new Date().toISOString().split("T")[0],
          expected_date: po.expected_date || null,
          received_at: po.received_at || (po.status === "received" ? new Date().toISOString() : null),
          received_by: po.received_by || null,
        })
        .select()
        .single();

      if (!poErr && newPo) {
        const itemsPayload = items.map((it) => {
          let dbExp: string | null = null;
          if (it.expiry_date && String(it.expiry_date).trim()) {
            const exp = String(it.expiry_date).trim();
            if (/^\d{4}-\d{2}$/.test(exp)) {
              dbExp = `${exp}-01`;
            } else if (/^\d{1,2}\/\d{4}$/.test(exp)) {
              const [m, y] = exp.split("/");
              dbExp = `${y}-${m.padStart(2, "0")}-01`;
            } else {
              dbExp = exp;
            }
          }
          return {
            purchase_order_id: newPo.id,
            pharmacy_id: pharmacyId,
            medicine_id: it.medicine_id || null,
            medicine_name: it.medicine_name,
            order_quantity: it.order_quantity,
            received_qty: it.received_qty ?? (po.status === "received" ? it.order_quantity : 0),
            unit_cost: it.unit_cost,
            total_cost: it.total_cost,
            batch_number: it.batch_number || null,
            expiry_date: dbExp,
          };
        });
        const { data: savedItems } = await (
          supabase.from("purchase_order_items" as any) as any
        )
          .insert(itemsPayload)
          .select();

        savedPo = {
          ...newPo,
          items: savedItems || itemsPayload,
          supplier: po.supplier,
        };
      }
    } catch {
      // Ignored for missing table
    }

    // Local Storage fallback & sync
    if (!savedPo) {
      const generatedId = `po_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const savedItems: PurchaseOrderItemRecord[] = items.map((it, idx) => ({
        id: `poi_${Date.now()}_${idx}`,
        purchase_order_id: generatedId,
        medicine_id: it.medicine_id || null,
        medicine_name: it.medicine_name || "Unknown Medicine",
        order_quantity: Number(it.order_quantity) || 1,
        received_qty: it.received_qty ?? (po.status === "received" ? Number(it.order_quantity) || 1 : 0),
        unit_cost: Number(it.unit_cost) || 0,
        total_cost: Number(it.total_cost) || 0,
        batch_number: it.batch_number || null,
        expiry_date: it.expiry_date || null,
      }));

      savedPo = {
        id: generatedId,
        pharmacy_id: pharmacyId,
        warehouse_id: po.warehouse_id || "",
        supplier_id: po.supplier_id || "",
        po_number: po.po_number || `PO-${Date.now().toString().slice(-6)}`,
        status: po.status || "draft",
        total_amount: Number(po.total_amount) || 0,
        notes: po.notes || null,
        order_date: po.order_date || new Date().toISOString().split("T")[0],
        expected_date: po.expected_date || null,
        received_at: po.received_at || (po.status === "received" ? new Date().toISOString() : null),
        received_by: po.received_by || null,
        created_at: new Date().toISOString(),
        supplier: po.supplier,
        items: savedItems,
      };
    }

    const current = readLocal<PurchaseOrderRecord[]>(storageKey, []);
    writeLocal(storageKey, [savedPo, ...current.filter((p) => p.id !== savedPo!.id)]);
    return savedPo;
  },

  async updatePurchaseOrderStatus(
    pharmacyId: string,
    poId: string,
    status: "draft" | "ordered" | "received" | "cancelled",
    extraData?: Partial<PurchaseOrderRecord>
  ): Promise<void> {
    const storageKey = `warehouse_pos_${pharmacyId}`;
    try {
      await (supabase.from("purchase_orders" as any) as any)
        .update({
          status,
          ...extraData,
        })
        .eq("id", poId);
    } catch {
      // Ignore
    }

    const current = readLocal<PurchaseOrderRecord[]>(storageKey, []);
    const updated = current.map((p) => {
      if (p.id === poId) {
        return {
          ...p,
          status,
          ...extraData,
        };
      }
      return p;
    });
    writeLocal(storageKey, updated);
  },

  // ==========================================
  // 3. BRANCH REQUISITIONS
  // ==========================================
  async getBranchRequisitions(
    pharmacyId: string,
    locationId?: string | null
  ): Promise<BranchRequisitionRecord[]> {
    const storageKey = `warehouse_requisitions_${pharmacyId}`;
    try {
      let query = (supabase.from("branch_requisitions" as any) as any)
        .select(`
          *,
          items:branch_requisition_items(*)
        `)
        .eq("pharmacy_id", pharmacyId)
        .order("created_at", { ascending: false });

      if (locationId) {
        query = query.or(`from_branch_id.eq.${locationId},to_warehouse_id.eq.${locationId}`);
      }

      const { data, error } = await query;

      if (error) {
        if (isMissingTableError(error)) {
          return this.getNormalizedLocalRequisitions(storageKey, locationId);
        }
        console.warn("[warehouseStorage] Supabase getBranchRequisitions warning:", error.message);
      } else if (Array.isArray(data)) {
        const normalized = data.map((r: any) => ({
          ...r,
          from_branch_id: r.from_branch_id || r.from_location_id,
          to_warehouse_id: r.to_warehouse_id || r.to_location_id,
          from_location_id: r.from_branch_id || r.from_location_id,
          to_location_id: r.to_warehouse_id || r.to_location_id,
          priority: r.priority || r.urgency || "normal",
          status: r.status === "pending" ? "submitted" : r.status,
          items: (r.items || []).map((it: any) => ({
            ...it,
            requested_qty: it.requested_qty ?? it.requested_quantity ?? 1,
            requested_quantity: it.requested_qty ?? it.requested_quantity ?? 1,
          })),
        }));

        // Preserve global store while updating records
        const existing = readLocal<BranchRequisitionRecord[]>(storageKey, []);
        const mergedMap = new Map<string, BranchRequisitionRecord>();
        for (const item of existing) {
          mergedMap.set(item.id, item);
        }
        for (const item of normalized) {
          mergedMap.set(item.id, item as BranchRequisitionRecord);
        }
        writeLocal(storageKey, Array.from(mergedMap.values()));

        return normalized as BranchRequisitionRecord[];
      }
    } catch (err: any) {
      if (!isMissingTableError(err)) {
        console.warn("[warehouseStorage] Unexpected requisitions fetch error:", err);
      }
    }

    return this.getNormalizedLocalRequisitions(storageKey, locationId);
  },

  getNormalizedLocalRequisitions(storageKey: string, locationId?: string | null): BranchRequisitionRecord[] {
    const list = readLocal<BranchRequisitionRecord[]>(storageKey, []);
    const normalizedList = list.map((r: any) => ({
      ...r,
      from_branch_id: r.from_branch_id || r.from_location_id,
      to_warehouse_id: r.to_warehouse_id || r.to_location_id,
      from_location_id: r.from_branch_id || r.from_location_id,
      to_location_id: r.to_warehouse_id || r.to_location_id,
      priority: r.priority || r.urgency || "normal",
      status: r.status === "pending" ? "submitted" : r.status,
      items: (r.items || []).map((it: any) => ({
        ...it,
        requested_qty: it.requested_qty ?? it.requested_quantity ?? 1,
        requested_quantity: it.requested_qty ?? it.requested_quantity ?? 1,
        pack_unit: it.pack_unit || "box",
      })),
    }));

    if (!locationId) return normalizedList;
    return normalizedList.filter(
      (r) => r.from_branch_id === locationId || r.to_warehouse_id === locationId
    );
  },

  async saveBranchRequisition(
    pharmacyId: string,
    req: Partial<BranchRequisitionRecord> & {
      from_branch_id?: string | null;
      to_warehouse_id?: string | null;
      priority?: string;
    },
    items: Partial<BranchRequisitionItemRecord>[]
  ): Promise<BranchRequisitionRecord> {
    const storageKey = `warehouse_requisitions_${pharmacyId}`;
    let savedReq: BranchRequisitionRecord | null = null;

    const fromBranch = req.from_branch_id || req.from_location_id || null;
    const toWarehouse = req.to_warehouse_id || req.to_location_id || null;
    const priority = req.priority || req.urgency || "normal";
    // Strictly satisfy Postgres CHECK constraint (status IN ('draft', 'submitted', 'approved', 'dispatched', 'partially_fulfilled', 'completed', 'rejected'))
    const status = (req.status && req.status !== "pending") ? req.status : "submitted";

    try {
      const { data: newReq, error: reqErr } = await (
        supabase.from("branch_requisitions" as any) as any
      )
        .insert({
          pharmacy_id: pharmacyId,
          from_branch_id: fromBranch,
          to_warehouse_id: toWarehouse,
          requisition_number: req.requisition_number,
          status: status,
          priority: priority,
          notes: req.notes || null,
        })
        .select()
        .single();

      if (!reqErr && newReq) {
        const itemsPayload = items.map((it) => ({
          requisition_id: newReq.id,
          pharmacy_id: pharmacyId,
          medicine_id: it.medicine_id || null,
          medicine_name: it.medicine_name,
          requested_qty: (it as any).requested_qty || it.requested_quantity || 1,
          requested_quantity: (it as any).requested_qty || it.requested_quantity || 1,
          pack_unit: (it as any).pack_unit || "box",
          notes: it.notes || null,
        }));

        let savedItems: any[] | null = null;
        try {
          const { data: insertedItems } = await (
            supabase.from("branch_requisition_items" as any) as any
          )
            .insert(itemsPayload)
            .select();
          savedItems = insertedItems;
        } catch (itemInsertErr) {
          console.warn("[warehouseStorage] Items insert warning, continuing with payload:", itemInsertErr);
        }

        savedReq = {
          ...newReq,
          from_branch_id: newReq.from_branch_id || fromBranch,
          to_warehouse_id: newReq.to_warehouse_id || toWarehouse,
          from_location_id: newReq.from_branch_id || fromBranch,
          to_location_id: newReq.to_warehouse_id || toWarehouse,
          status: newReq.status,
          priority: newReq.priority,
          items: (savedItems || itemsPayload).map((si: any) => ({
            ...si,
            pack_unit: si.pack_unit || "box",
            requested_qty: si.requested_qty || si.requested_quantity || 1,
            requested_quantity: si.requested_qty || si.requested_quantity || 1,
          })),
        };
      } else if (reqErr) {
        console.warn("[warehouseStorage] Supabase saveBranchRequisition warning:", reqErr.message);
      }
    } catch (err: any) {
      console.warn("[warehouseStorage] Supabase insert error:", err?.message || err);
    }

    if (!savedReq) {
      const genId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const savedItems: BranchRequisitionItemRecord[] = items.map((it, idx) => ({
        id: `reqi_${Date.now()}_${idx}`,
        requisition_id: genId,
        medicine_id: it.medicine_id || null,
        medicine_name: it.medicine_name || "Unknown Medicine",
        requested_quantity: Number((it as any).requested_qty || it.requested_quantity) || 1,
        requested_qty: Number((it as any).requested_qty || it.requested_quantity) || 1,
        pack_unit: (it as any).pack_unit || "box",
        approved_quantity: null,
        notes: it.notes || null,
      }));

      savedReq = {
        id: genId,
        pharmacy_id: pharmacyId,
        from_branch_id: fromBranch,
        to_warehouse_id: toWarehouse,
        from_location_id: fromBranch || "",
        to_location_id: toWarehouse || "",
        requisition_number: req.requisition_number || `REQ-${Date.now().toString().slice(-6)}`,
        status: status,
        priority: priority as any,
        urgency: priority as any,
        notes: req.notes || null,
        created_at: new Date().toISOString(),
        items: savedItems,
      };
    }

    const current = this.getNormalizedLocalRequisitions(storageKey);
    writeLocal(storageKey, [savedReq, ...current.filter((r) => r.id !== savedReq!.id)]);

    // Dispatch global events for instant reactivity across all tabs and open listeners
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inventory-updated"));
      window.dispatchEvent(new CustomEvent("requisition-created", { detail: savedReq }));
    }

    return savedReq;
  },

  async updateBranchRequisitionStatus(
    pharmacyId: string,
    reqId: string,
    status: string
  ): Promise<void> {
    const storageKey = `warehouse_requisitions_${pharmacyId}`;
    const normalizedStatus = status === "pending" ? "submitted" : status === "fulfilled" ? "completed" : status;
    try {
      await (supabase.from("branch_requisitions" as any) as any)
        .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
        .eq("id", reqId);
    } catch {
      // Ignore
    }

    const current = this.getNormalizedLocalRequisitions(storageKey);
    const updated = current.map((r) => (r.id === reqId ? { ...r, status: normalizedStatus } : r));
    writeLocal(storageKey, updated);
  },

  async dispatchBranchRequisition(
    pharmacyId: string,
    reqId: string,
    dispatchedItems: {
      item_id?: string;
      medicine_id?: string;
      medicine_name: string;
      dispatched_qty: number;
      pack_unit?: string;
    }[]
  ): Promise<void> {
    const storageKey = `warehouse_requisitions_${pharmacyId}`;
    const timestamp = new Date().toISOString();

    // 1. Update requisition status in Supabase
    try {
      await (supabase.from("branch_requisitions" as any) as any)
        .update({
          status: "dispatched",
          dispatched_at: timestamp,
          updated_at: timestamp,
        })
        .eq("id", reqId);
    } catch (err) {
      console.warn("[warehouseStorage] Error updating requisition status in Supabase:", err);
    }

    // 2. Persist dispatched_qty on branch_requisition_items in Supabase
    for (const item of dispatchedItems) {
      if (item.item_id) {
        try {
          await (supabase.from("branch_requisition_items" as any) as any)
            .update({
              dispatched_qty: item.dispatched_qty,
              approved_quantity: item.dispatched_qty,
            })
            .eq("id", item.item_id);
        } catch (itemErr) {
          console.warn("[warehouseStorage] Error updating requisition item in Supabase:", itemErr);
        }
      }
    }

    // 3. Update localStorage fallback
    const current = this.getNormalizedLocalRequisitions(storageKey);
    const updated = current.map((r) => {
      if (r.id !== reqId) return r;
      const updatedItems = (r.items || []).map((it) => {
        const match = dispatchedItems.find(
          (di) =>
            (it.id && di.item_id && it.id === di.item_id) ||
            it.medicine_name.toLowerCase().trim() === di.medicine_name.toLowerCase().trim()
        );
        if (match) {
          return {
            ...it,
            dispatched_qty: match.dispatched_qty,
            approved_quantity: match.dispatched_qty,
          };
        }
        return it;
      });

      return {
        ...r,
        status: "dispatched",
        dispatched_at: timestamp,
        items: updatedItems,
      };
    });
    writeLocal(storageKey, updated);

    // 4. Dispatch inventory-updated event
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("inventory-updated", {
          detail: {
            timestamp: Date.now(),
            requisitionId: reqId,
            status: "dispatched",
          },
        })
      );
    }
  },

  async receiveRequisitionDelivery(
    pharmacyId: string,
    requisitionId: string,
    activeLocationId: string,
    requisitionNumber: string,
    currentUserId?: string,
    locations: any[] = []
  ): Promise<{ success: boolean; transfersProcessed: number }> {
    const storageKey = `warehouse_requisitions_${pharmacyId}`;
    let processedCount = 0;

    // 1. Query stock_transfers matching to_location_id, status pending, and requisition reference
    try {
      const { data: matchedTransfers, error: transferErr } = await (supabase
        .from("stock_transfers" as any) as any)
        .select("*")
        .eq("to_location_id", activeLocationId)
        .eq("status", "pending")
        .or(`note.ilike.%${requisitionNumber}%,notes.ilike.%${requisitionNumber}%`);

      if (!transferErr && Array.isArray(matchedTransfers) && matchedTransfers.length > 0) {
        for (const tr of matchedTransfers) {
          try {
            await processAcceptTransfer(
              tr.id,
              pharmacyId,
              currentUserId,
              tr,
              locations
            );
            processedCount++;
          } catch (itemErr) {
            console.warn("[warehouseStorage] Error processing transfer row during receipt:", tr.id, itemErr);
          }
        }
      }
    } catch (err: any) {
      console.warn("[warehouseStorage] Error querying linked stock_transfers:", err);
    }

    // 2. Direct Requisition Items Ledger Credit (Fallback & Complementary Assurance)
    // If no stock_transfers were processed, or to guarantee every requisition line-item is credited
    if (processedCount === 0) {
      let reqItems: any[] = [];

      // Step A: Attempt DB retrieval with join
      try {
        const { data: reqData } = await (supabase
          .from("branch_requisitions" as any) as any)
          .select(`*, items:branch_requisition_items(*)`)
          .eq("id", requisitionId)
          .maybeSingle();

        if (reqData && Array.isArray(reqData.items) && reqData.items.length > 0) {
          reqItems = reqData.items;
        }
      } catch (dbErr) {
        console.warn("[warehouseStorage] Error querying Supabase branch_requisitions join:", dbErr);
      }

      // Step B: Robust fallback to localStorage cache
      if (reqItems.length === 0) {
        const localReqs = this.getNormalizedLocalRequisitions(storageKey);
        const foundLocal = localReqs.find((r) => r.id === requisitionId);
        if (foundLocal && Array.isArray(foundLocal.items) && foundLocal.items.length > 0) {
          reqItems = foundLocal.items;
        }
      }

      if (reqItems.length === 0) {
        throw new Error(
          `Unable to find requisition items for ${requisitionNumber}. Receipt aborted to prevent ledger desync.`
        );
      }

      // Step C: Process Inventory Math (UPSERT at receiving location)
      for (const item of reqItems) {
        const qty = Number(
          item.dispatched_qty ??
          item.approved_quantity ??
          item.requested_qty ??
          item.requested_quantity ??
          0
        );
        if (qty <= 0) continue;
        const medName = (item.medicine_name || "").trim();
        if (!medName) continue;

        // Check if medicine already exists at destination branch
        const { data: destMeds, error: searchErr } = await supabase
          .from("medicines")
          .select("*")
          .eq("pharmacy_id", pharmacyId)
          .eq("location_id", activeLocationId)
          .ilike("name", medName);

        if (searchErr) {
          throw new Error(`Failed to query destination inventory for ${medName}: ${searchErr.message}`);
        }

        if (destMeds && destMeds.length > 0) {
          // Increment stock
          const target = destMeds[0];
          const newStock = (Number(target.stock_quantity) || 0) + qty;
          const { error: updErr } = await supabase
            .from("medicines")
            .update({ stock_quantity: newStock })
            .eq("id", target.id);

          if (updErr) {
            throw new Error(`Failed to increment stock for ${medName}: ${updErr.message}`);
          }
        } else {
          // Insert a new medicine row at the destination location (UPSERT)
          let origMed: any = null;
          if (item.medicine_id) {
            const { data: o } = await supabase
              .from("medicines")
              .select("*")
              .eq("id", item.medicine_id)
              .maybeSingle();
            origMed = o;
          }
          if (!origMed) {
            const { data: oList } = await supabase
              .from("medicines")
              .select("*")
              .eq("pharmacy_id", pharmacyId)
              .ilike("name", medName)
              .limit(1);
            origMed = oList?.[0];
          }

          const { error: insErr } = await supabase.from("medicines").insert({
            pharmacy_id: pharmacyId,
            location_id: activeLocationId,
            name: origMed?.name || medName,
            generic_name: origMed?.generic_name || null,
            company_name: origMed?.company_name || null,
            product_type: origMed?.product_type || "Tablet",
            product_size: origMed?.product_size || null,
            unit_format: origMed?.unit_format || null,
            format: origMed?.format || null,
            strength: origMed?.strength || null,
            price: origMed?.price || 0,
            stock_quantity: qty,
            pcs_per_strip: origMed?.pcs_per_strip || 1,
            strip_per_pack: origMed?.strip_per_pack || 1,
            box_size: origMed?.box_size || null,
            pack_size: origMed?.pack_size || null,
            expiry_date: origMed?.expiry_date || null,
          });

          if (insErr) {
            throw new Error(
              `Failed to create inventory record for ${medName} at receiving branch: ${insErr.message}`
            );
          }
        }
        processedCount++;
      }
    }

    // 3. Strict Guard: If zero items were credited, DO NOT transition status to completed!
    if (processedCount === 0) {
      throw new Error(
        `No inventory items could be received or verified for ${requisitionNumber}. Receipt aborted to maintain ledger balance.`
      );
    }

    // 4. Update Requisition Status to 'completed' with received_at timestamp
    const receivedTimestamp = new Date().toISOString();
    try {
      await (supabase.from("branch_requisitions" as any) as any)
        .update({
          status: "completed",
          received_at: receivedTimestamp,
          updated_at: receivedTimestamp,
        })
        .eq("id", requisitionId);
    } catch (err) {
      console.warn("[warehouseStorage] Error updating requisition status in Supabase:", err);
    }

    // 5. Update local storage cache
    const current = this.getNormalizedLocalRequisitions(storageKey);
    const updated = current.map((r) =>
      r.id === requisitionId
        ? {
            ...r,
            status: "completed" as any,
            received_at: receivedTimestamp,
          }
        : r
    );
    writeLocal(storageKey, updated);

    // 6. Mark any pending linked stock_transfers as accepted
    try {
      await (supabase.from("stock_transfers" as any) as any)
        .update({
          status: "accepted",
          accepted_at: receivedTimestamp,
          accepted_by: currentUserId || null,
        })
        .eq("to_location_id", activeLocationId)
        .eq("status", "pending")
        .or(`note.ilike.%${requisitionNumber}%,notes.ilike.%${requisitionNumber}%`);
    } catch (trUpdErr) {
      console.warn("[warehouseStorage] Note on linked stock_transfers status update:", trUpdErr);
    }

    // 7. Dispatch global inventory-updated event to trigger reactive re-render
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("inventory-updated", {
          detail: {
            timestamp: Date.now(),
            requisitionId,
            requisitionNumber,
            activeLocationId,
            processedCount,
          },
        })
      );
    }

    return { success: true, transfersProcessed: processedCount };
  },

  // ==========================================
  // 4. STOCK AUDITS
  // ==========================================
  async getStockAudits(
    pharmacyId: string,
    locationId: string
  ): Promise<StockAuditRecord[]> {
    const storageKey = `warehouse_audits_${pharmacyId}_${locationId}`;
    try {
      const { data, error } = await (supabase.from("stock_audits" as any) as any)
        .select(`
          *,
          items:stock_audit_items(*)
        `)
        .eq("pharmacy_id", pharmacyId)
        .eq("location_id", locationId)
        .order("created_at", { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          return readLocal<StockAuditRecord[]>(storageKey, []);
        }
        console.warn("[warehouseStorage] Supabase getStockAudits warning:", error.message);
      } else if (Array.isArray(data)) {
        writeLocal(storageKey, data);
        return data as StockAuditRecord[];
      }
    } catch (err: any) {
      if (!isMissingTableError(err)) {
        console.warn("[warehouseStorage] Unexpected stock audits fetch error:", err);
      }
    }

    return readLocal<StockAuditRecord[]>(storageKey, []);
  },

  async saveStockAudit(
    pharmacyId: string,
    locationId: string,
    audit: Partial<StockAuditRecord>,
    items: Partial<StockAuditItemRecord>[]
  ): Promise<StockAuditRecord> {
    const storageKey = `warehouse_audits_${pharmacyId}_${locationId}`;
    let savedAudit: StockAuditRecord | null = null;

    try {
      const { data: newAudit, error: auditErr } = await (
        supabase.from("stock_audits" as any) as any
      )
        .insert({
          pharmacy_id: pharmacyId,
          location_id: locationId,
          audit_number: audit.audit_number,
          status: "completed",
          notes: audit.notes || null,
        })
        .select()
        .single();

      if (!auditErr && newAudit) {
        const itemsPayload = items.map((it) => ({
          audit_id: newAudit.id,
          medicine_id: it.medicine_id,
          medicine_name: it.medicine_name,
          system_quantity: it.system_quantity,
          counted_quantity: it.counted_quantity,
          variance_quantity: it.variance_quantity,
          adjustment_reason: it.adjustment_reason,
        }));
        const { data: savedItems } = await (
          supabase.from("stock_audit_items" as any) as any
        )
          .insert(itemsPayload)
          .select();

        savedAudit = {
          ...newAudit,
          items: savedItems || itemsPayload,
        };
      }
    } catch {
      // Ignored for missing table
    }

    if (!savedAudit) {
      const genId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const savedItems: StockAuditItemRecord[] = items.map((it, idx) => ({
        id: `auditi_${Date.now()}_${idx}`,
        audit_id: genId,
        medicine_id: it.medicine_id || "",
        medicine_name: it.medicine_name || "Unknown",
        system_quantity: Number(it.system_quantity) || 0,
        counted_quantity: Number(it.counted_quantity) || 0,
        variance_quantity: Number(it.variance_quantity) || 0,
        adjustment_reason: it.adjustment_reason || "Cycle Count",
      }));

      savedAudit = {
        id: genId,
        pharmacy_id: pharmacyId,
        location_id: locationId,
        audit_number: audit.audit_number || `AUD-${Date.now().toString().slice(-6)}`,
        status: "completed",
        notes: audit.notes || null,
        created_at: new Date().toISOString(),
        items: savedItems,
      };
    }

    const current = readLocal<StockAuditRecord[]>(storageKey, []);
    writeLocal(storageKey, [savedAudit, ...current.filter((a) => a.id !== savedAudit!.id)]);
    return savedAudit;
  },
};
