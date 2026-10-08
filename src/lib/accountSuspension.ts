import { supabase } from "@/integrations/supabase/client";

export interface SuspensionNoticeData {
  reason?: string | null;
  suspendedAt?: string | null;
  suspendedBy?: string | null;
  suspendedByRole?: "owner" | "manager" | null;
  timestamp: number;
}

export interface SuspensionStatus {
  isSuspended: boolean;
  reason?: string | null;
  suspendedAt?: string | null;
  suspendedBy?: string | null;
  suspendedByRole?: "owner" | "manager" | null;
}

export const SUSPENSION_STORAGE_KEY = "medinist_suspended_notice";

/**
 * Reads any stored suspension notice from sessionStorage or localStorage
 */
export function getStoredSuspensionNotice(): SuspensionNoticeData | null {
  try {
    const raw = sessionStorage.getItem(SUSPENSION_STORAGE_KEY) || localStorage.getItem(SUSPENSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves suspension notice so the Login screen or modal can display it
 */
export function setStoredSuspensionNotice(data: { reason?: string | null; suspendedAt?: string | null }) {
  try {
    const payload: SuspensionNoticeData = {
      reason: data.reason || null,
      suspendedAt: data.suspendedAt || null,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(SUSPENSION_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(SUSPENSION_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("medinist:account-suspended", { detail: payload }));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Clears the stored suspension notice
 */
export function clearStoredSuspensionNotice() {
  try {
    sessionStorage.removeItem(SUSPENSION_STORAGE_KEY);
    localStorage.removeItem(SUSPENSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("medinist:account-suspended-cleared"));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Checks if a given user is currently suspended in the shop.
 * Checks staff_access, is_staff_suspended RPC, shop_staff table, and profiles.
 */
export async function checkUserSuspension(userId: string): Promise<SuspensionStatus> {
  if (!userId) {
    return { isSuspended: false };
  }

  try {
    // 1. Query staff_access table (dedicated table for staff permissions & suspension)
    const { data: accessData, error: accessError } = await supabase
      .from("staff_access" as any)
      .select("is_suspended, suspend_reason, suspended_at, updated_by")
      .eq("user_id", userId)
      .maybeSingle();

    if (!accessError && accessData) {
      const isSuspended = Boolean((accessData as any).is_suspended);
      if (isSuspended) {
        const rawReason = (accessData as any).suspend_reason || null;
        let suspendedByRole: "owner" | "manager" | null = null;
        let cleanReason = rawReason;

        if (rawReason?.startsWith("[by:owner]")) {
          suspendedByRole = "owner";
          cleanReason = rawReason.replace("[by:owner]", "").trim();
        } else if (rawReason?.startsWith("[by:manager]")) {
          suspendedByRole = "manager";
          cleanReason = rawReason.replace("[by:manager]", "").trim();
        }

        return {
          isSuspended: true,
          reason: cleanReason,
          suspendedAt: (accessData as any).suspended_at || null,
          suspendedBy: (accessData as any).updated_by || null,
          suspendedByRole,
        };
      }
    }

    // 2. Query helper RPC is_staff_suspended if available
    try {
      const { data: rpcSuspended } = await supabase.rpc("is_staff_suspended" as any, {
        _user_id: userId,
      });
      if (rpcSuspended === true) {
        return {
          isSuspended: true,
          reason: (accessData as any)?.suspend_reason || null,
          suspendedAt: (accessData as any)?.suspended_at || null,
        };
      }
    } catch {
      // Non-blocking if RPC fails or not permitted
    }

    // 3. Query shop_staff table (for membership status or is_suspended)
    try {
      const { data: staffData } = await supabase
        .from("shop_staff" as any)
        .select("status, is_suspended" as any)
        .eq("user_id", userId)
        .maybeSingle();

      if (staffData) {
        const staffStatus = (staffData as any).status;
        const staffIsSusp = (staffData as any).is_suspended;
        if (staffStatus === "suspended" || staffIsSusp === true) {
          return {
            isSuspended: true,
            reason: (accessData as any)?.suspend_reason || null,
          };
        }
      }
    } catch {
      // Non-blocking
    }

    // 4. Query shop_members table (if present in schema)
    try {
      const { data: memberData } = await supabase
        .from("shop_members" as any)
        .select("status, is_suspended" as any)
        .eq("user_id", userId)
        .maybeSingle();

      if (memberData) {
        const memberStatus = (memberData as any).status;
        const memberIsSusp = (memberData as any).is_suspended;
        if (memberStatus === "suspended" || memberIsSusp === true) {
          return {
            isSuspended: true,
            reason: (accessData as any)?.suspend_reason || null,
          };
        }
      }
    } catch {
      // Non-blocking
    }

    // 5. Query profiles table (for direct profile suspension flags)
    try {
      const { data: profileData } = await supabase
        .from("profiles" as any)
        .select("is_suspended, status" as any)
        .eq("id", userId)
        .maybeSingle();

      if (profileData) {
        if ((profileData as any).is_suspended === true || (profileData as any).status === "suspended") {
          return {
            isSuspended: true,
            reason: (accessData as any)?.suspend_reason || null,
          };
        }
      }
    } catch {
      // Non-blocking
    }

    return { isSuspended: false };
  } catch (err) {
    console.warn("[accountSuspension] Error verifying suspension status:", err);
    return { isSuspended: false };
  }
}

/**
 * Broadcasts staff suspension change across real-time channels
 */
export async function broadcastStaffSuspension(params: {
  userId: string;
  pharmacyId: string;
  isSuspended: boolean;
  reason?: string | null;
  suspendedBy?: string | null;
  suspendedByRole?: "owner" | "manager" | null;
}) {
  try {
    // 1. Direct user security channel
    const userChannel = supabase.channel(`user_security_${params.userId}`);
    userChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await userChannel.send({
            type: "broadcast",
            event: "account_suspended",
            payload: params,
          });
        } catch (sendErr) {
          console.warn("[broadcastStaffSuspension] userChannel send error:", sendErr);
        }
        setTimeout(() => supabase.removeChannel(userChannel), 2500);
      }
    });

    // 2. Pharmacy staff channel
    if (params.pharmacyId) {
      const shopChannel = supabase.channel(`staff_suspension_shop_${params.pharmacyId}`);
      shopChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await shopChannel.send({
              type: "broadcast",
              event: "staff_suspension_change",
              payload: params,
            });
          } catch (sendErr) {
            console.warn("[broadcastStaffSuspension] shopChannel send error:", sendErr);
          }
          setTimeout(() => supabase.removeChannel(shopChannel), 2500);
        }
      });
    }
  } catch (err) {
    console.warn("[broadcastStaffSuspension] Broadcast failed:", err);
  }
}

/**
 * Immediately force-terminates the active session for a suspended user:
 * - Stores the suspension notice
 * - Calls Supabase auth signOut()
 * - Cleans tokens/storage/cache
 * - Redirects to login
 */
export async function forceTerminateSession(params?: {
  reason?: string | null;
  suspendedAt?: string | null;
  redirect?: boolean;
}) {
  try {
    // 1. Save notice in storage for Login screen display
    setStoredSuspensionNotice({
      reason: params?.reason || null,
      suspendedAt: params?.suspendedAt || null,
    });

    // 2. Clear app and session caches from localStorage (while keeping suspension notice)
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key !== SUSPENSION_STORAGE_KEY) {
          if (
            key.startsWith("medinist_") ||
            key.startsWith("sb-") ||
            key.includes("supabase") ||
            key.startsWith("notif_") ||
            key.startsWith("staff_") ||
            key.startsWith("shift_")
          ) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      localStorage.removeItem("medinist_demo");
    }

    // 3. Invalidate Supabase session
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[forceTerminateSession] SignOut error:", err);
  } finally {
    // 4. Force immediate navigation to login if requested
    if (params?.redirect !== false) {
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
  }
}
