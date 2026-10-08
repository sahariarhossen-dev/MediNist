export interface StockDistributionItem {
  location_id: string; // Matches location code ('MB-01') or id ('loc-main')
  qty: number; // Stock quantity in pieces / base units
}

export interface InventoryMedicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null; // Total stock across all locations
  stock_distribution?: StockDistributionItem[];
  location_id?: string | null;
  branch_id?: string | null;
  medicine_id?: string | null;
  master_medicine_id?: string | null;
  strip_per_pack: number | null;
  pcs_per_strip: number | null;
  product_type: string | null;
  unit_format: string | null;
  product_size: string | null;
  stock_alert: number | null;
  generic_name?: string | null;
  box_size?: string | null;
  pack_size?: string | null;
  expiry_date?: string | null;
}
