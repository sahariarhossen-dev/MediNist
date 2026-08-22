// Mapping helpers between the two role vocabularies in the app:
//   profiles.role     -> 'admin' | 'manager' | 'salesman'
//   shop_staff.role   -> 'owner' | 'manager' | 'salesman'
export type InviteRole = "owner" | "manager" | "salesman";

export const INVITE_ROLES: InviteRole[] = ["owner", "manager", "salesman"];

export const profileRoleToInviteRole = (role?: string | null): InviteRole => {
  if (role === "admin") return "owner";
  if (role === "manager") return "manager";
  return "salesman";
};

export const inviteRoleLabel = (role?: string | null): string => {
  switch (role) {
    case "owner":
    case "admin":
      return "Owner";
    case "manager":
      return "Manager";
    default:
      return "Salesman";
  }
};

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
  /** Default when no explicit row exists (mirrors public.has_staff_permission) */
  defaultEnabled: boolean;
}

export const STAFF_PERMISSIONS: PermissionDef[] = [
  { key: "record_sales", label: "Record sales", description: "Create and complete invoices", defaultEnabled: true },
  { key: "edit_inventory", label: "Edit inventory", description: "Add or update products and stock", defaultEnabled: true },
  { key: "view_profit", label: "View profit & margins", description: "See cost, profit and margin figures", defaultEnabled: false },
  { key: "override_discount", label: "Override discounts", description: "Change the discount on a sale", defaultEnabled: false },
  { key: "record_cash_out", label: "Record payments & expenses", description: "Log cash going out of the shop", defaultEnabled: false },
  { key: "close_day", label: "Close the day", description: "Submit the daily cash closing", defaultEnabled: false },
  { key: "view_staff_performance", label: "View staff performance", description: "See other members' sales figures", defaultEnabled: false },
];
