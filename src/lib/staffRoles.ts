// Mapping helpers between the two role vocabularies in the app:
//   profiles.role     -> 'admin' | 'manager' | 'salesman'
//   shop_staff.role   -> 'owner' | 'manager' | 'salesman'
export type InviteRole = "owner" | "manager" | "salesman";

export const INVITE_ROLES: InviteRole[] = ["owner", "manager", "salesman"];

// Strict Hierarchical RBAC: owner (3) > manager (2) > salesman / staff (1)
export const ROLE_HIERARCHY_LEVEL: Record<InviteRole, number> = {
  owner: 3,
  manager: 2,
  salesman: 1,
};

/**
 * Checks whether caller role is strictly higher in hierarchy than target role.
 */
export const isStrictlySuperior = (callerRole?: string | null, targetRole?: string | null): boolean => {
  const caller = profileRoleToInviteRole(callerRole);
  const target = profileRoleToInviteRole(targetRole);
  return ROLE_HIERARCHY_LEVEL[caller] > ROLE_HIERARCHY_LEVEL[target];
};

/**
 * Checks whether a caller can manage/supervise the target member.
 * - Owner: can supervise managers and salesmen (everyone except self).
 * - Manager: can ONLY supervise salesmen (strictly subordinate).
 *   Cannot manage or alter other managers or the owner.
 * - Salesman: cannot supervise any members.
 */
export const canSuperviseTarget = (callerRole?: string | null, targetRole?: string | null): boolean => {
  const caller = profileRoleToInviteRole(callerRole);
  const target = profileRoleToInviteRole(targetRole);
  if (caller === "owner") return true;
  if (caller === "manager") return target === "salesman";
  return false;
};

/**
 * Checks whether a caller is allowed to suspend or reactivate the target.
 * - Owner can suspend managers & salesmen.
 * - Manager can ONLY suspend salesmen.
 */
export const canSuspendTarget = (callerRole?: string | null, targetRole?: string | null): boolean => {
  return canSuperviseTarget(callerRole, targetRole);
};

/**
 * Checks whether a caller is permitted to change roles.
 * - Strict restriction: ONLY owners can modify staff roles.
 */
export const canChangeRoles = (callerRole?: string | null): boolean => {
  return profileRoleToInviteRole(callerRole) === "owner";
};

/**
 * Checks whether a caller is permitted to permanently remove staff from the shop.
 * - Strict restriction: ONLY owners can permanently delete members.
 */
export const canRemoveStaff = (callerRole?: string | null): boolean => {
  return profileRoleToInviteRole(callerRole) === "owner";
};

/**
 * Checks which roles the caller is allowed to invite:
 * - Owner: can invite owner, manager, salesman
 * - Manager: can ONLY invite salesman
 */
export const getAllowedInviteRoles = (callerRole?: string | null): InviteRole[] => {
  const caller = profileRoleToInviteRole(callerRole);
  if (caller === "owner") return ["salesman", "manager", "owner"];
  if (caller === "manager") return ["salesman"];
  return [];
};

/**
 * Checks whether a caller can view detailed performance of a target:
 * - Owner can view all members.
 * - Manager can view salesmen and their own profile. Cannot view owner or peer managers.
 * - Salesman can only view their own profile.
 */
export const canViewDetailedPerformance = (
  callerRole?: string | null,
  targetRole?: string | null,
  isSelf = false
): boolean => {
  if (isSelf) return true;
  const caller = profileRoleToInviteRole(callerRole);
  const target = profileRoleToInviteRole(targetRole);
  if (caller === "owner") return true;
  if (caller === "manager") return target === "salesman";
  return false;
};

export const profileRoleToInviteRole = (role?: string | null): InviteRole => {
  const normalized = (role || "").toLowerCase().trim();
  if (normalized === "owner" || normalized === "admin") return "owner";
  if (normalized === "manager") return "manager";
  return "salesman";
};

export const inviteRoleLabel = (role?: string | null): string => {
  const normalized = (role || "").toLowerCase().trim();
  switch (normalized) {
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
