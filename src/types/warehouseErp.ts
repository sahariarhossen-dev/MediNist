export type SupplierPaymentTerms = 'net_15' | 'net_30' | 'net_60' | 'cash' | 'credit';

export const DAYS_OF_WEEK = [
  { day: 0, label: "Sunday", short: "Sun" },
  { day: 1, label: "Monday", short: "Mon" },
  { day: 2, label: "Tuesday", short: "Tue" },
  { day: 3, label: "Wednesday", short: "Wed" },
  { day: 4, label: "Thursday", short: "Thu" },
  { day: 5, label: "Friday", short: "Fri" },
  { day: 6, label: "Saturday", short: "Sat" },
] as const;

export interface Manufacturer {
  id: string;
  name: string;
  code?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface SupplierManufacturer {
  id: string;
  pharmacy_id: string;
  supplier_id: string;
  manufacturer_id: string;
  created_at?: string;
  manufacturer?: Manufacturer;
}

export interface Supplier {
  id: string;
  pharmacy_id: string;
  location_id?: string | null;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  payment_terms?: SupplierPaymentTerms;
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
  updated_at: string;
}

export type SupplierLedgerTransactionType =
  | 'opening_balance'
  | 'bill'
  | 'payment'
  | 'return'
  | 'adjustment';

export interface SupplierLedgerEntry {
  id: string;
  pharmacy_id: string;
  location_id?: string | null;
  supplier_id: string;
  purchase_order_id?: string | null;
  transaction_type: SupplierLedgerTransactionType;
  description?: string | null;
  debit: number;   // Decreases liability (payments made to supplier)
  credit: number;  // Increases liability (bills/purchases from supplier)
  running_balance?: number;
  created_at: string;
  created_by?: string | null;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partial_received' | 'received' | 'cancelled';
export type PurchaseOrderPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface PurchaseOrder {
  id: string;
  pharmacy_id: string;
  warehouse_id?: string | null;
  supplier_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  total_amount: number;
  paid_amount: number;
  payment_status: PurchaseOrderPaymentStatus;
  notes?: string | null;
  created_by?: string | null;
  expected_delivery_date?: string | null;
  received_at?: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  pharmacy_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  created_at: string;
}

export type RequisitionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'dispatched'
  | 'partially_fulfilled'
  | 'completed'
  | 'rejected';

export type RequisitionPriority = 'low' | 'normal' | 'urgent';

export interface BranchRequisition {
  id: string;
  pharmacy_id: string;
  from_branch_id?: string | null;
  to_warehouse_id?: string | null;
  requisition_number: string;
  status: RequisitionStatus;
  priority: RequisitionPriority;
  notes?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  items?: BranchRequisitionItem[];
  from_branch_name?: string;
  to_warehouse_name?: string;
}

export interface BranchRequisitionItem {
  id: string;
  requisition_id: string;
  pharmacy_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  requested_qty: number;
  approved_qty: number;
  dispatched_qty: number;
  created_at: string;
}

export type StockAuditStatus = 'in_progress' | 'completed' | 'cancelled';

export interface StockAudit {
  id: string;
  pharmacy_id: string;
  location_id?: string | null;
  audit_number: string;
  status: StockAuditStatus;
  notes?: string | null;
  conducted_by?: string | null;
  conducted_at: string;
  created_at: string;
  updated_at: string;
  items?: StockAuditItem[];
}

export interface StockAuditItem {
  id: string;
  audit_id: string;
  pharmacy_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  system_qty: number;
  counted_qty: number;
  variance_qty: number;
  unit_cost: number;
  reason?: string | null;
  created_at: string;
}
