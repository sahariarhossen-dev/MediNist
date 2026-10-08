import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, AlertTriangle, Trash2, Copy, Megaphone, Trophy, ChevronRight,
  Search, MoreVertical, PauseCircle, PlayCircle, UserCog, SlidersHorizontal,
  Activity, Users, Zap, Lock, Unlock, Coffee, Play,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { STAFF_PERMISSIONS, inviteRoleLabel, profileRoleToInviteRole, type InviteRole } from "@/lib/staffRoles";
import DutyControlCenter from "@/components/staff/DutyControlCenter";
import { broadcastStaffSuspension } from "@/lib/accountSuspension";


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function extractInvokeError(error: any, data: any): Promise<string> {
  if (data?.error) return data.error;
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return body.error;
    } catch {
      try {
        const text = await ctx.clone().text();
        if (text) return text;
      } catch {}
    }
  }
  return error?.message || "Something went wrong. Please try again.";
}

interface StaffMember {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at?: string | null;
  user_id?: string | null;
}

interface StaffOverviewRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: string | null;
  month_sales: number;
  month_count: number;
  monthly_target: number;
  commission_percent: number;
  basic_salary: number;
  is_suspended: boolean;
  suspended_by?: string | null;
  suspended_by_role?: "owner" | "manager" | null;
  suspended_by_name?: string | null;
  suspended_at?: string | null;
  suspend_reason?: string | null;
  is_locked?: boolean;
  locked_by?: string | null;
  locked_by_role?: "owner" | "manager" | null;
  locked_by_name?: string | null;
  locked_at?: string | null;
  is_on_break?: boolean;
  last_seen: string | null;
}


export type BroadcastTarget = "all" | "role" | "user";

interface BroadcastRow {
  id: string;
  message: string;
  target_type: BroadcastTarget;
  target_value: string | null;
  is_urgent: boolean;
  created_at: string;
}

const SEND_TO_OPTIONS: { label: string; type: BroadcastTarget; role?: "salesman" | "manager" }[] = [
  { label: "All Staff", type: "all" },
  { label: "Salesmen Only", type: "role", role: "salesman" },
  { label: "Managers Only", type: "role", role: "manager" },
  { label: "Specific Person", type: "user" },
];

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

const StaffManagement = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userRole = profileRoleToInviteRole(profile?.role);
  const isOwner = userRole === "owner";
  const isManager = userRole === "manager";
  const canManage = isOwner || isManager;

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [overview, setOverview] = useState<StaffOverviewRow[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  
  const [loading, setLoading] = useState(true);

  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [broadcastDraft, setBroadcastDraft] = useState("");
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [targetType, setTargetType] = useState<BroadcastTarget>("all");
  const [roleTargetValue, setRoleTargetValue] = useState<"salesman" | "manager">("salesman");
  const [targetUser, setTargetUser] = useState<string>("");
  const [isUrgent, setIsUrgent] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("salesman");
  const [inviting, setInviting] = useState(false);
  const [linkDialog, setLinkDialog] = useState({ open: false, email: "", role: "", url: "" });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | InviteRole>("all");

  const [permTarget, setPermTarget] = useState<StaffOverviewRow | null>(null);
  const [roleTarget, setRoleTarget] = useState<StaffOverviewRow | null>(null);
  const [roleDraft, setRoleDraft] = useState<InviteRole>("salesman");
  const [suspendTarget, setSuspendTarget] = useState<StaffOverviewRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [removeTarget, setRemoveTarget] = useState<StaffOverviewRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.pharmacy_id, canManage]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchOverview(),
      fetchBroadcast(),
      canManage ? fetchStaff() : Promise.resolve(),
      isOwner ? fetchPermissions() : Promise.resolve(),
    ]);
    setLoading(false);
  };

  const fetchStaff = async () => {
    const { data } = await supabase
      .from("shop_staff")
      .select("id,email,role,status,created_at,expires_at,user_id")
      .eq("pharmacy_id", profile!.pharmacy_id!)
      .order("created_at", { ascending: false });
    if (data) setStaff(data as unknown as StaffMember[]);
  };

  const fetchOverview = async () => {
    if (!profile?.pharmacy_id) return;
    const { data } = await supabase.rpc("get_pharmacy_staff_overview" as any);
    if (!data) return;

    // Fetch staff_access records for suspension & read-only lock details
    const { data: accessList } = await supabase
      .from("staff_access" as any)
      .select("user_id, is_suspended, suspend_reason, suspended_at, updated_by, is_read_only, read_only_reason, read_only_since")
      .eq("pharmacy_id", profile.pharmacy_id);

    // Fetch profiles to map actor IDs to roles (owner vs manager)
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("pharmacy_id", profile.pharmacy_id);

    const profileMap = new Map<string, { role: string | null; name: string | null }>();
    (allProfiles || []).forEach((p) => profileMap.set(p.id, { role: p.role, name: p.full_name }));

    // Fetch open shifts to know who is on duty break
    let openShifts: any[] = [];
    try {
      const { data: shifts } = await supabase
        .from("staff_shifts" as any)
        .select("user_id, current_break_started_at, ended_at")
        .eq("pharmacy_id", profile.pharmacy_id)
        .is("ended_at", null);
      if (shifts) openShifts = shifts;
    } catch {
      // Non-blocking
    }

    const shiftMap = new Map<string, { on_break: boolean }>();
    openShifts.forEach((s) => {
      shiftMap.set(s.user_id, { on_break: Boolean(s.current_break_started_at) });
    });

    const accessMap = new Map<string, any>();
    (accessList || []).forEach((a: any) => accessMap.set(a.user_id, a));

    const rows = (data as unknown as StaffOverviewRow[])
      .map((r) => {
        const access = accessMap.get(r.user_id);
        const shift = shiftMap.get(r.user_id);

        const isSusp = access ? Boolean(access.is_suspended) : Boolean(r.is_suspended);
        const isLocked = Boolean(access?.is_read_only);
        const isOnBreak = Boolean(shift?.on_break);

        let suspendedByRole: "owner" | "manager" | null = null;
        let suspendedByName: string | null = null;
        let cleanReason = access?.suspend_reason || null;

        if (cleanReason?.startsWith("[by:owner]")) {
          suspendedByRole = "owner";
          cleanReason = cleanReason.replace("[by:owner]", "").trim();
        } else if (cleanReason?.startsWith("[by:manager]")) {
          suspendedByRole = "manager";
          cleanReason = cleanReason.replace("[by:manager]", "").trim();
        } else if (access?.updated_by) {
          const updater = profileMap.get(access.updated_by);
          if (updater) {
            suspendedByRole = ((updater.role || "").toLowerCase().trim() === "owner") ? "owner" : "manager";
            suspendedByName = updater.name;
          }
        }

        let lockedByRole: "owner" | "manager" | null = null;
        let lockedByName: string | null = null;
        if (access?.read_only_reason?.includes("[by:owner]")) {
          lockedByRole = "owner";
        } else if (access?.read_only_reason?.includes("[by:manager]")) {
          lockedByRole = "manager";
        } else if (access?.updated_by && isLocked) {
          const updater = profileMap.get(access.updated_by);
          if (updater) {
            lockedByRole = ((updater.role || "").toLowerCase().trim() === "owner") ? "owner" : "manager";
            lockedByName = updater.name;
          }
        }

        return {
          ...r,
          month_sales: Number(r.month_sales || 0),
          monthly_target: Number(r.monthly_target || 0),
          month_count: Number(r.month_count || 0),
          commission_percent: Number(r.commission_percent || 0),
          basic_salary: Number(r.basic_salary || 0),
          is_suspended: isSusp,
          suspended_by: access?.updated_by || null,
          suspended_by_role: suspendedByRole,
          suspended_by_name: suspendedByName,
          suspended_at: access?.suspended_at || null,
          suspend_reason: cleanReason,
          is_locked: isLocked,
          locked_by: access?.updated_by || null,
          locked_by_role: lockedByRole,
          locked_by_name: lockedByName,
          locked_at: access?.read_only_since || null,
          is_on_break: isOnBreak,
        };
      })
      .sort((a, b) => b.month_sales - a.month_sales);

    setOverview(rows);
  };

  const fetchPermissions = async () => {
    const { data } = await supabase
      .from("staff_permissions" as any)
      .select("user_id, permission_key, enabled")
      .eq("pharmacy_id", profile!.pharmacy_id!);
    const map: Record<string, Record<string, boolean>> = {};
    ((data as any[]) || []).forEach((row) => {
      map[row.user_id] = map[row.user_id] || {};
      map[row.user_id][row.permission_key] = row.enabled;
    });
    setPermissions(map);
  };


  const fetchBroadcast = async () => {
    const { data } = await supabase
      .from("pharmacy_broadcasts" as any)
      .select("id, message, target_type, target_value, is_urgent, created_at")
      .eq("pharmacy_id", profile!.pharmacy_id!)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setBroadcasts(((data as any[]) || []) as BroadcastRow[]);
  };

  const handleSaveBroadcast = async () => {
    if (!profile?.pharmacy_id || !profile?.id) return;
    const msg = broadcastDraft.trim();
    if (!msg) {
      toast({ title: "Notice is empty", variant: "destructive" });
      return;
    }
    let target_value: string | null = null;
    if (targetType === "role") target_value = roleTargetValue;
    if (targetType === "user") {
      if (!targetUser) {
        toast({ title: "Pick a staff member", variant: "destructive" });
        return;
      }
      target_value = targetUser;
    }
    setSavingBroadcast(true);
    const { error } = await supabase.from("pharmacy_broadcasts" as any).insert({
      pharmacy_id: profile.pharmacy_id,
      created_by: profile.id,
      message: msg,
      is_active: true,
      target_type: targetType,
      target_value,
      is_urgent: isUrgent,
    });
    setSavingBroadcast(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Notice posted" });
    setBroadcastDraft("");
    setIsUrgent(false);
    setTargetUser("");
    fetchBroadcast();
  };

  const handleClearBroadcast = async (id: string) => {
    const { error } = await supabase
      .from("pharmacy_broadcasts" as any)
      .update({ is_active: false } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Failed to clear", description: error.message, variant: "destructive" });
      return;
    }
    setBroadcasts((prev) => prev.filter((b) => b.id !== id));
    toast({ title: "Notice cleared" });
  };

  const pickableStaff = useMemo(() => {
    return overview
      .filter((s) => {
        if (s.is_suspended || s.user_id === profile?.id) return false;
        if (isManager) {
          // Managers can only target salesmen
          return profileRoleToInviteRole(s.role) === "salesman";
        }
        return true;
      })
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [overview, profile?.id, isManager]);

  const salesmanIds = useMemo(() => {
    return overview
      .filter((r) => profileRoleToInviteRole(r.role) === "salesman")
      .map((r) => r.user_id);
  }, [overview]);

  const audienceLabel = (b: BroadcastRow) => {
    if (b.target_type === "role") return b.target_value === "manager" ? "Managers" : "Salesmen";
    if (b.target_type === "user") {
      const m = overview.find((s) => s.user_id === b.target_value);
      return m?.full_name || "Staff member";
    }
    return "All Staff";
  };

  const handleCardClick = (targetUserId: string, targetRole: InviteRole, isSelf: boolean) => {
    if (isManager && !isSelf && targetRole !== "salesman") {
      toast({
        title: "Access Restricted",
        description: "Managers are not permitted to view performance details for owners or peer managers.",
        variant: "destructive",
      });
      return;
    }
    navigate(`/staff/${targetUserId}`);
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email) || email.length > 255) {
      toast({ title: "Invalid email", description: "Enter a valid email like name@example.com.", variant: "destructive" });
      return;
    }
    const finalRole: InviteRole = isManager ? "salesman" : inviteRole;
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-staff", { body: { email, role: finalRole } });
    setInviting(false);
    if (error || data?.error) {
      toast({ title: "Invitation failed", description: await extractInvokeError(error, data), variant: "destructive" });
      return;
    }
    setLinkDialog({ open: true, email: data?.email ?? email, role: data?.role ?? finalRole, url: data?.acceptUrl ?? "" });
    setInviteEmail("");
    if (isOwner) setInviteRole("salesman");
    fetchStaff();
  };

  const handleResendInvite = async (email: string, role: string) => {
    if (isManager && profileRoleToInviteRole(role) !== "salesman") {
      toast({ title: "Unauthorized", description: "Managers can only resend invitations for salesmen.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.functions.invoke("invite-staff", { body: { email, role } });
    if (error || data?.error) {
      toast({ title: "Resend failed", description: await extractInvokeError(error, data), variant: "destructive" });
      return;
    }
    setLinkDialog({ open: true, email: data?.email ?? email, role: data?.role ?? role, url: data?.acceptUrl ?? "" });
    fetchStaff();
  };

  const handleRevokeInvite = async (id: string) => {
    const targetInvite = staff.find((s) => s.id === id);
    if (isManager && targetInvite && profileRoleToInviteRole(targetInvite.role) !== "salesman") {
      toast({ title: "Unauthorized", description: "Managers can only revoke invitations for salesmen.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("shop_staff").update({ status: "revoked" } as any).eq("id", id);
    if (error) { toast({ title: "Revoke failed", description: error.message, variant: "destructive" }); return; }
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, status: "revoked" } : s)));
    toast({ title: "Invitation revoked" });
  };

  const handleDeleteInvite = async (id: string) => {
    const targetInvite = staff.find((s) => s.id === id);
    if (isManager && targetInvite && profileRoleToInviteRole(targetInvite.role) !== "salesman") {
      toast({ title: "Unauthorized", description: "Managers can only remove invitations for salesmen.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("shop_staff").delete().eq("id", id);
    if (error) { toast({ title: "Remove failed", variant: "destructive" }); return; }
    setStaff((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Invitation removed" });
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share it with the invitee." });
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the link manually.", variant: "destructive" });
    }
  };

  const toggleSuspend = async (row: StaffOverviewRow, suspend: boolean, reason?: string) => {
    if (!profile?.pharmacy_id) return;
    const callerRole = profileRoleToInviteRole(profile.role);
    const targetRole = profileRoleToInviteRole(row.role);

    if (callerRole !== "owner" && callerRole !== "manager") {
      toast({ title: "Permission denied", description: "You are not authorized to alter staff access.", variant: "destructive" });
      return;
    }

    // Strict Hierarchy Guard: Managers can ONLY suspend/reactivate salesmen
    if (callerRole === "manager" && targetRole !== "salesman") {
      toast({
        title: "Action prohibited",
        description: "Managers can only suspend or reactivate staff with the salesman role.",
        variant: "destructive",
      });
      return;
    }

    // Case A: Full Suspension permission check:
    // If account was suspended by owner, a manager CANNOT un-suspend or reactivate it.
    if (!suspend && callerRole === "manager") {
      if (row.suspended_by_role === "owner") {
        toast({
          title: "Permission denied",
          description: "Only the Owner can lift this suspension.",
          variant: "destructive",
        });
        return;
      }

      // Backend / DB policy guard to prevent un-suspending owner suspensions
      const { data: dbAccess } = await supabase
        .from("staff_access" as any)
        .select("suspend_reason, updated_by")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const rawReason = (dbAccess as any)?.suspend_reason || "";
      const updatedBy = (dbAccess as any)?.updated_by;
      let ownerSuspended = rawReason.includes("[by:owner]");

      if (!ownerSuspended && updatedBy) {
        const { data: updaterProf } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", updatedBy)
          .maybeSingle();
        if ((updaterProf?.role || "").toLowerCase().trim() === "owner") {
          ownerSuspended = true;
        }
      }

      if (ownerSuspended) {
        toast({
          title: "Permission denied",
          description: "Only the Owner can lift this suspension.",
          variant: "destructive",
        });
        return;
      }
    }

    if (row.user_id === profile.id) {
      toast({ title: "Action prohibited", description: "You cannot suspend your own account.", variant: "destructive" });
      return;
    }

    setBusy(true);

    const taggedReason = `[by:${callerRole}] ${reason?.trim() || "Suspended by " + callerRole}`;

    // Call manage_staff_suspension RPC (which enforces DB-level hierarchy, writes audit log, and notifies owners)
    const { error: rpcError } = await supabase.rpc("manage_staff_suspension" as any, {
      _user_id: row.user_id,
      _is_suspended: suspend,
      _suspend_reason: suspend ? taggedReason : null,
    });

    if (rpcError) {
      // Client fallback: direct table updates + activity log + owner notification
      const { error: accessErr } = await supabase.from("staff_access" as any).upsert(
        {
          pharmacy_id: profile.pharmacy_id,
          user_id: row.user_id,
          is_suspended: suspend,
          suspended_at: suspend ? new Date().toISOString() : null,
          suspend_reason: suspend ? taggedReason : null,
          updated_by: profile.id,
        } as any,
        { onConflict: "user_id" },
      );

      if (accessErr) {
        setBusy(false);
        toast({ title: suspend ? "Suspend failed" : "Reactivate failed", description: accessErr.message, variant: "destructive" });
        return;
      }

      await supabase
        .from("shop_staff")
        .update({ status: suspend ? "suspended" : "active" } as any)
        .eq("user_id", row.user_id)
        .eq("pharmacy_id", profile.pharmacy_id);

      await supabase.from("staff_activity_logs" as any).insert({
        pharmacy_id: profile.pharmacy_id,
        user_id: profile.id,
        action_type: suspend ? "staff_suspended" : "staff_reactivated",
        entity_type: "profile",
        entity_id: row.user_id,
        description: `${profile.full_name || callerRole} (${callerRole}): ${suspend ? "Suspended access for salesman " : "Reactivated access for salesman "}${row.full_name || "Staff"}${reason?.trim() ? ` (Reason: ${reason.trim()})` : ""}`,
        severity: "security",
      });

      // When a manager suspends a salesman, trigger an in-app audit/notification to the shop 'owner'
      if (callerRole === "manager") {
        const { data: owners } = await supabase
          .from("profiles")
          .select("id")
          .eq("pharmacy_id", profile.pharmacy_id)
          .eq("role", "owner");

        const managerName = profile.full_name || "Manager";
        const staffName = row.full_name || "Salesman";
        const reasonText = reason?.trim() ? ` (Reason: ${reason.trim()})` : "";
        const notificationMsg = suspend
          ? `Manager ${managerName} suspended salesman ${staffName}${reasonText}`
          : `Manager ${managerName} reactivated salesman ${staffName}`;

        if (owners && owners.length > 0) {
          const notifs = owners.map((owner) => ({
            shop_id: profile.pharmacy_id,
            pharmacy_id: profile.pharmacy_id,
            user_id: owner.id,
            title: suspend ? "Staff Suspension Alert" : "Staff Reactivation Alert",
            message: notificationMsg,
            type: "staff_suspension",
            metadata: {
              actor_id: profile.id,
              actor_name: managerName,
              actor_role: "manager",
              target_id: row.user_id,
              target_name: staffName,
              target_role: "salesman",
              is_suspended: suspend,
              reason: reason?.trim() || null,
            },
          }));
          await supabase.from("notifications" as any).insert(notifs);
        }
      }
    }

    setBusy(false);
    setOverview((prev) =>
      prev.map((r) =>
        r.user_id === row.user_id
          ? {
              ...r,
              is_suspended: suspend,
              suspended_by: suspend ? profile.id : null,
              suspended_by_role: suspend ? callerRole : null,
              suspended_by_name: suspend ? (profile.full_name || callerRole) : null,
              suspended_at: suspend ? new Date().toISOString() : null,
              suspend_reason: suspend ? (reason?.trim() || null) : null,
            }
          : r
      )
    );
    setSuspendTarget(null);
    setSuspendReason("");

    // Broadcast immediate suspension event for real-time session termination
    broadcastStaffSuspension({
      userId: row.user_id,
      pharmacyId: profile.pharmacy_id,
      isSuspended: suspend,
      reason: reason?.trim() || null,
      suspendedBy: profile.id,
      suspendedByRole: callerRole,
    });

    toast({ title: suspend ? `${row.full_name || "Staff"} suspended` : `${row.full_name || "Staff"} reactivated` });
  };

  // Case B: Shift Lock (Temporary read-only mode)
  // Both manager and owner can lock or unlock shift at any time
  const handleToggleShiftLock = async (row: StaffOverviewRow, lock: boolean) => {
    if (!profile?.pharmacy_id || !profile?.id) return;
    setBusy(true);

    const callerRole = isOwner ? "owner" : "manager";
    const reason = lock ? `[by:${callerRole}] Locked remotely by ${profile.full_name || callerRole}` : null;

    const { error: rpcError } = await supabase.rpc("admin_set_staff_read_only" as any, {
      _user_id: row.user_id,
      _on: lock,
      _reason: reason || undefined,
    });

    if (rpcError) {
      await supabase.from("staff_access" as any).upsert(
        {
          pharmacy_id: profile.pharmacy_id,
          user_id: row.user_id,
          is_read_only: lock,
          read_only_since: lock ? new Date().toISOString() : null,
          read_only_reason: reason,
          updated_by: profile.id,
        } as any,
        { onConflict: "user_id" }
      );
    }

    await supabase.from("staff_activity_logs" as any).insert({
      pharmacy_id: profile.pharmacy_id,
      user_id: profile.id,
      action_type: lock ? "staff_shift_locked" : "staff_shift_unlocked",
      entity_type: "profile",
      entity_id: row.user_id,
      description: `${profile.full_name || "Staff"} (${callerRole}): ${lock ? "Locked shift (read-only) for " : "Unlocked shift for "}${row.full_name || "Staff"}`,
      severity: "routine",
    });

    setBusy(false);
    setOverview((prev) =>
      prev.map((r) =>
        r.user_id === row.user_id
          ? {
              ...r,
              is_locked: lock,
              locked_by: lock ? profile.id : null,
              locked_by_role: lock ? callerRole : null,
              locked_at: lock ? new Date().toISOString() : null,
            }
          : r
      )
    );

    toast({
      title: lock ? "Shift locked" : "Shift unlocked",
      description: lock
        ? `${row.full_name || "Staff"} is now in read-only mode.`
        : `${row.full_name || "Staff"} can now perform sales and edits normally.`,
    });
  };

  // Case B: Duty Break (Temporary shift pause / resume)
  // Both manager and owner can pause or resume break at any time
  const handleToggleDutyBreak = async (row: StaffOverviewRow, pauseBreak: boolean) => {
    if (!profile?.pharmacy_id || !profile?.id) return;
    setBusy(true);

    const callerRole = isOwner ? "owner" : "manager";
    const fn = pauseBreak ? "admin_pause_shift" : "admin_resume_shift";
    const { error } = await supabase.rpc(fn as any, { _user_id: row.user_id });

    if (error) {
      try {
        await supabase
          .from("staff_shifts" as any)
          .update({
            current_break_started_at: pauseBreak ? new Date().toISOString() : null,
          } as any)
          .eq("pharmacy_id", profile.pharmacy_id)
          .eq("user_id", row.user_id)
          .is("ended_at", null);
      } catch {
        // Fallback
      }
    }

    await supabase.from("staff_activity_logs" as any).insert({
      pharmacy_id: profile.pharmacy_id,
      user_id: profile.id,
      action_type: pauseBreak ? "staff_break_started" : "staff_break_resumed",
      entity_type: "profile",
      entity_id: row.user_id,
      description: `${profile.full_name || "Staff"} (${callerRole}): ${pauseBreak ? "Placed on duty break: " : "Resumed duty from break: "}${row.full_name || "Staff"}`,
      severity: "routine",
    });

    setBusy(false);
    setOverview((prev) =>
      prev.map((r) =>
        r.user_id === row.user_id ? { ...r, is_on_break: pauseBreak } : r
      )
    );

    toast({
      title: pauseBreak ? "Duty break started" : "Duty resumed",
      description: pauseBreak
        ? `${row.full_name || "Staff"} is now on duty break.`
        : `${row.full_name || "Staff"} has resumed active duty.`,
    });
  };

  const handleChangeRole = async () => {
    if (!roleTarget) return;
    if (!isOwner) {
      toast({ title: "Unauthorized", description: "Only shop owners are authorized to change staff roles.", variant: "destructive" });
      setRoleTarget(null);
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_staff_role" as any, {
      _user_id: roleTarget.user_id,
      _role: roleDraft,
    });
    setBusy(false);
    if (error) { toast({ title: "Role change failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Role updated to ${inviteRoleLabel(roleDraft)}` });
    setRoleTarget(null);
    await loadAll();
  };

  const handleRemoveStaff = async () => {
    if (!removeTarget) return;
    if (!isOwner) {
      toast({ title: "Unauthorized", description: "Only shop owners are authorized to remove staff from the shop.", variant: "destructive" });
      setRemoveTarget(null);
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_remove_staff" as any, { _user_id: removeTarget.user_id });
    setBusy(false);
    if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${removeTarget.full_name || "Staff member"} removed` });
    setRemoveTarget(null);
    await loadAll();
  };

  const togglePermission = async (row: StaffOverviewRow, key: string, enabled: boolean) => {
    if (!isOwner) {
      toast({ title: "Unauthorized", description: "Only shop owners can edit staff permissions.", variant: "destructive" });
      return;
    }
    if (!profile?.pharmacy_id) return;
    setPermissions((prev) => ({ ...prev, [row.user_id]: { ...(prev[row.user_id] || {}), [key]: enabled } }));
    const { error } = await supabase.from("staff_permissions" as any).upsert(
      {
        pharmacy_id: profile.pharmacy_id,
        user_id: row.user_id,
        permission_key: key,
        enabled,
        updated_by: profile.id,
      } as any,
      { onConflict: "user_id,permission_key" },
    );
    if (error) {
      toast({ title: "Could not save permission", description: error.message, variant: "destructive" });
      fetchPermissions();
    }
  };

  const permValue = (userId: string, key: string) => {
    const explicit = permissions[userId]?.[key];
    if (typeof explicit === "boolean") return explicit;
    return STAFF_PERMISSIONS.find((p) => p.key === key)?.defaultEnabled ?? false;
  };

  const pendingInvites = useMemo(() => {
    const all = staff.filter((s) => s.status !== "accepted" && s.status !== "active");
    if (isManager) {
      // Manager can only see salesman invitations
      return all.filter((s) => profileRoleToInviteRole(s.role) === "salesman");
    }
    return all;
  }, [staff, isManager]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return overview.filter((r) => {
      const asInvite = profileRoleToInviteRole(r.role);
      if (roleFilter !== "all" && asInvite !== roleFilter) return false;
      if (!q) return true;
      return (r.full_name || "").toLowerCase().includes(q) || (r.phone || "").includes(q);
    });
  }, [overview, search, roleFilter]);

  const teamSales = overview.reduce((sum, r) => sum + r.month_sales, 0);
  const activeCount = overview.filter((r) => !r.is_suspended).length;
  const nameOf = (id: string) => overview.find((r) => r.user_id === id)?.full_name || "Someone";

  const topPerformer = useMemo(() => {
    if (isManager) {
      return overview.find(
        (r) => r.month_sales > 0 && (profileRoleToInviteRole(r.role) === "salesman" || r.user_id === profile?.id)
      );
    }
    return overview.find((r) => r.month_sales > 0);
  }, [overview, isManager, profile?.id]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-background pb-16">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">Staff Management</h1>
          <p className="text-xs text-muted-foreground">Roles, permissions and performance</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-4 grid grid-cols-3 gap-2">
        <div className="p-3 rounded-2xl bg-card border border-emerald-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Team</p>
          <p className="text-base font-bold text-foreground tabular-nums">{overview.length}</p>
        </div>
        <div className="p-3 rounded-2xl bg-card border border-emerald-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Active</p>
          <p className="text-base font-bold text-foreground tabular-nums">{activeCount}</p>
        </div>
        <div className="p-3 rounded-2xl bg-card border border-emerald-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Month sales</p>
          <p className="text-base font-bold text-foreground tabular-nums">{money(teamSales)}</p>
        </div>
      </div>

      <div className="px-4 mt-4">
        <Tabs defaultValue="team">
          <TabsList className="w-full rounded-2xl">
            <TabsTrigger value="team" className="flex-1 rounded-xl gap-1.5">
              <Users size={14} /> Team
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="invites" className="flex-1 rounded-xl gap-1.5">
                <Send size={14} /> Invites
                {pendingInvites.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                    {pendingInvites.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="activity" className="flex-1 rounded-xl gap-1.5">
                <Activity size={14} /> Activity
              </TabsTrigger>
            )}
          </TabsList>


          {/* ---------------- TEAM ---------------- */}
          <TabsContent value="team" className="mt-4 space-y-3">
            {canManage && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <Megaphone size={14} className="text-amber-700" />
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Internal Broadcast</p>
                </div>
                <Textarea
                  placeholder="Post a notice (e.g., Meeting at 5 PM)"
                  value={broadcastDraft}
                  onChange={(e) => setBroadcastDraft(e.target.value)}
                  className="rounded-xl bg-white border-amber-200 text-sm min-h-[60px]"
                />

                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={
                        targetType === "all"
                          ? "all"
                          : targetType === "role"
                          ? `role:${roleTargetValue}`
                          : "user"
                      }
                      onValueChange={(value) => {
                        if (value === "all") {
                          setTargetType("all");
                          setTargetUser("");
                        } else if (value.startsWith("role:")) {
                          setTargetType("role");
                          setRoleTargetValue(value.replace("role:", "") as "salesman" | "manager");
                          setTargetUser("");
                        } else if (value === "user") {
                          setTargetType("user");
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 flex-1 min-w-[7rem] rounded-xl border-amber-200 bg-white text-xs focus:ring-amber-500">
                        <div className="flex items-center gap-1.5">
                          <Users size={13} className="text-amber-600 shrink-0" />
                          <SelectValue placeholder="Target audience" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-amber-200">
                        <SelectItem value="all" className="text-xs">All Staff</SelectItem>
                        <SelectItem value="role:salesman" className="text-xs">Salesmen Only</SelectItem>
                        {isOwner && <SelectItem value="role:manager" className="text-xs">Managers Only</SelectItem>}
                        <SelectItem value="user" className="text-xs">Specific Person…</SelectItem>
                      </SelectContent>
                    </Select>

                    <label className="flex items-center gap-1.5 shrink-0 px-2 py-1.5 rounded-lg bg-white/60 border border-amber-200 text-[11px] font-medium text-amber-800">
                      <Switch
                        checked={isUrgent}
                        onCheckedChange={setIsUrgent}
                        className="data-[state=checked]:bg-amber-600 scale-90"
                      />
                      <Zap size={12} className="text-amber-600" />
                      Urgent
                    </label>

                    <Button
                      onClick={handleSaveBroadcast}
                      disabled={savingBroadcast || !broadcastDraft.trim()}
                      className="h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white gap-1.5 px-4 shrink-0"
                    >
                      <Send size={13} /> {savingBroadcast ? "..." : "Post"}
                    </Button>
                  </div>

                  {targetType === "user" && (
                    <Select value={targetUser} onValueChange={setTargetUser}>
                      <SelectTrigger className="h-9 w-full rounded-xl border-amber-200 bg-white text-xs focus:ring-amber-500">
                        <SelectValue placeholder="Pick a staff member" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-amber-200">
                        {pickableStaff.length === 0 && (
                          <SelectItem value="" disabled className="text-xs">No active staff</SelectItem>
                        )}
                        {pickableStaff.map((s) => (
                          <SelectItem key={s.user_id} value={s.user_id} className="text-xs">
                            {s.full_name || "Unnamed"} · {inviteRoleLabel(profileRoleToInviteRole(s.role))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {broadcasts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Active notices</p>
                    {broadcasts.map((b) => (
                      <div key={b.id} className="rounded-xl bg-white border border-amber-200 p-3">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-sm text-amber-900 whitespace-pre-wrap break-words">{b.message}</p>
                          <button
                            type="button"
                            onClick={() => handleClearBroadcast(b.id)}
                            className="p-1 rounded-lg hover:bg-amber-50 shrink-0"
                            aria-label="Clear notice"
                          >
                            <Trash2 size={14} className="text-amber-700" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">
                            To: {audienceLabel(b)}
                          </Badge>
                          {b.is_urgent && (
                            <Badge variant="destructive" className="text-[10px]">Urgent</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}


            {/* Top performer */}
            {topPerformer && (
              <button
                onClick={() => handleCardClick(topPerformer.user_id, profileRoleToInviteRole(topPerformer.role), topPerformer.user_id === profile?.id)}
                className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-200/70">
                    <Trophy size={20} className="text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Top Performer · This Month</p>
                    <p className="text-sm font-bold text-foreground truncate">{topPerformer.full_name || "Unnamed"}</p>
                    <p className="text-xs text-amber-800 tabular-nums">{money(topPerformer.month_sales)} in sales</p>
                  </div>
                  <ChevronRight size={18} className="text-amber-700 shrink-0" />
                </div>
              </button>
            )}

            {/* Search + filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search staff by name or phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="h-10 rounded-xl border border-emerald-200 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                aria-label="Filter by role"
              >
                <option value="all">All roles</option>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="salesman">Salesman</option>
              </select>
            </div>

            {/* Staff cards */}
            <div className="space-y-2">
              {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading team…</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No staff members match your filters</p>
              )}
              {filtered.map((row, idx) => {
                const isTop = idx === 0 && row.month_sales > 0 && !search && roleFilter === "all";
                const pct = row.monthly_target > 0 ? Math.min(100, (row.month_sales / row.monthly_target) * 100) : 0;
                const dotColor = row.is_suspended
                  ? "bg-rose-500"
                  : isTop ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-400" : "bg-gray-300";
                const initials = (row.full_name || row.role || "?")
                  .split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
                const isSelf = row.user_id === profile?.id;
                const targetRole = profileRoleToInviteRole(row.role);
                const isTargetSubordinate = targetRole === "salesman";
                const canShowActions = isOwner ? !isSelf : (isManager && isTargetSubordinate && !isSelf);

                return (
                  <div
                    key={row.user_id}
                    className={`p-3 bg-card rounded-2xl border ${row.is_suspended ? "border-rose-200 bg-rose-50/40" : row.is_locked ? "border-amber-200 bg-amber-50/30" : "border-border"}`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCardClick(row.user_id, targetRole, isSelf)}
                        className="relative shrink-0"
                        aria-label="Open staff details"
                      >
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={row.avatar_url || undefined} />
                          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">{initials}</AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${dotColor}`} />
                      </button>
                      <button
                        onClick={() => handleCardClick(row.user_id, targetRole, isSelf)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">{row.full_name || "Unnamed"}</p>
                          <Badge variant="secondary" className="text-[9px] rounded-md py-0 h-4">{inviteRoleLabel(row.role)}</Badge>
                          {row.is_suspended && (
                            <Badge className="text-[9px] rounded-md py-0 h-4 bg-rose-100 text-rose-700 border-rose-200">
                              Suspended{row.suspended_by_role ? ` (${row.suspended_by_role})` : ""}
                            </Badge>
                          )}
                          {!row.is_suspended && row.is_locked && (
                            <Badge className="text-[9px] rounded-md py-0 h-4 bg-amber-100 text-amber-800 border-amber-200 flex items-center gap-1">
                              <Lock size={9} /> Shift Locked
                            </Badge>
                          )}
                          {!row.is_suspended && row.is_on_break && (
                            <Badge className="text-[9px] rounded-md py-0 h-4 bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1">
                              <Coffee size={9} /> On Break
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {money(row.month_sales)} · {row.month_count} invoices
                        </p>
                        {row.monthly_target > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={pct} className="h-1.5 flex-1" />
                            <span className="text-[10px] font-medium text-muted-foreground tabular-nums w-9 text-right">{Math.round(pct)}%</span>
                          </div>
                        )}
                      </button>

                      {canShowActions ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 rounded-full hover:bg-muted shrink-0" aria-label="Staff actions">
                              <MoreVertical size={16} className="text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl w-56">
                            <DropdownMenuItem onClick={() => navigate(`/staff/${row.user_id}`)} className="gap-2">
                              <ChevronRight size={14} /> View performance
                            </DropdownMenuItem>
                            {isOwner && (
                              <>
                                <DropdownMenuItem onClick={() => setPermTarget(row)} className="gap-2">
                                  <SlidersHorizontal size={14} /> Permissions
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => { setRoleTarget(row); setRoleDraft(profileRoleToInviteRole(row.role)); }}
                                  className="gap-2"
                                >
                                  <UserCog size={14} /> Change role
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            {row.is_suspended ? (
                              isManager && row.suspended_by_role === "owner" ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-full">
                                        <DropdownMenuItem
                                          disabled
                                          className="gap-2 text-muted-foreground opacity-50 cursor-not-allowed select-none"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toast({
                                              title: "Permission denied",
                                              description: "Only the Owner can lift this suspension.",
                                              variant: "destructive",
                                            });
                                          }}
                                        >
                                          <Lock size={14} className="text-amber-600 shrink-0" />
                                          <span>Reactivate access</span>
                                        </DropdownMenuItem>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-xs max-w-xs bg-slate-900 text-white p-2 rounded-lg shadow-lg">
                                      Only the Owner can lift this suspension
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <DropdownMenuItem onClick={() => toggleSuspend(row, false)} className="gap-2 text-emerald-700">
                                  <PlayCircle size={14} /> Reactivate access
                                </DropdownMenuItem>
                              )
                            ) : (
                              <DropdownMenuItem onClick={() => { setSuspendTarget(row); setSuspendReason(""); }} className="gap-2 text-amber-700">
                                <PauseCircle size={14} /> Suspend access
                              </DropdownMenuItem>
                            )}

                            {/* Temporary Shift Lock & Duty Break Controls (Allowed for both manager and owner) */}
                            {!row.is_suspended && (
                              <>
                                <DropdownMenuSeparator />
                                {row.is_locked ? (
                                  <DropdownMenuItem onClick={() => handleToggleShiftLock(row, false)} className="gap-2 text-blue-700">
                                    <Unlock size={14} /> Unlock Shift (Active)
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleToggleShiftLock(row, true)} className="gap-2 text-slate-700">
                                    <Lock size={14} /> Lock Shift (Read-only)
                                  </DropdownMenuItem>
                                )}

                                {row.is_on_break ? (
                                  <DropdownMenuItem onClick={() => handleToggleDutyBreak(row, false)} className="gap-2 text-emerald-700">
                                    <Play size={14} /> End Duty Break (Resume)
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleToggleDutyBreak(row, true)} className="gap-2 text-amber-700">
                                    <Coffee size={14} /> Put on Duty Break (Pause)
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}

                            {isOwner && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setRemoveTarget(row)} className="gap-2 text-destructive">
                                  <Trash2 size={14} /> Remove from shop
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        /* In staff list: hide the context action menu (three-dot button) entirely for managers on owner or peer manager accounts */
                        isManager ? null : (
                          <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ---------------- INVITES ---------------- */}
          {canManage && (
            <TabsContent value="invites" className="mt-4 space-y-4">
              <div className="p-4 rounded-2xl bg-card border border-emerald-100 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Invite a team member</p>
                <Input
                  placeholder="Staff email address"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
                />
                <div className="flex gap-2 items-start">
                  {isManager ? (
                    <div className="flex-1 h-10 rounded-xl border border-muted bg-muted/40 px-3 flex items-center text-sm font-medium text-foreground">
                      Salesman <span className="ml-2 text-[10px] text-muted-foreground">(Role locked for manager)</span>
                    </div>
                  ) : (
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                      className="flex-1 h-10 rounded-xl border border-emerald-200 bg-background px-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      aria-label="Invite role"
                    >
                      <option value="salesman">Salesman</option>
                      <option value="manager">Manager</option>
                    </select>
                  )}
                  <Button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    <Send size={14} /> {inviting ? "Sending..." : "Send"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isManager
                    ? "Managers can invite salesmen. Invitations expire after 7 days."
                    : "Invitations expire after 7 days."}
                </p>
              </div>

              <div className="space-y-2">
                {pendingInvites.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No pending invitations</p>
                )}
                {pendingInvites.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-muted rounded-2xl">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.email}</p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] rounded-lg">{inviteRoleLabel(s.role)}</Badge>
                        <Badge
                          className={`text-[10px] rounded-lg capitalize ${
                            s.status === "pending"
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : "bg-gray-200 text-gray-600 border-gray-300"
                          }`}
                        >
                          {s.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {s.status === "pending" && (
                        <>
                          <button onClick={() => handleResendInvite(s.email, s.role)} className="p-2 rounded-full hover:bg-emerald-100" title="Generate new link">
                            <Send size={14} className="text-emerald-600" />
                          </button>
                          <button onClick={() => handleRevokeInvite(s.id)} className="p-2 rounded-full hover:bg-amber-100" title="Revoke invitation">
                            <AlertTriangle size={14} className="text-amber-600" />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDeleteInvite(s.id)} className="p-2 rounded-full hover:bg-destructive/10" title="Remove">
                        <Trash2 size={16} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}

          {/* ---------------- ACTIVITY ---------------- */}
          {canManage && (
            <TabsContent value="activity" className="mt-4">
              <DutyControlCenter
                nameOf={nameOf}
                canControl={canManage}
                allowedUserIds={isManager ? salesmanIds : undefined}
                staffOptions={
                  isManager
                    ? overview
                        .filter((r) => profileRoleToInviteRole(r.role) === "salesman")
                        .map((r) => ({ user_id: r.user_id, full_name: r.full_name }))
                    : overview.map((r) => ({ user_id: r.user_id, full_name: r.full_name }))
                }
              />
            </TabsContent>
          )}

        </Tabs>
      </div>

      {/* Permissions sheet */}
      <Dialog open={!!permTarget} onOpenChange={(o) => !o && setPermTarget(null)}>
        <DialogContent className="rounded-3xl max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Permissions</DialogTitle>
            <DialogDescription className="text-xs">
              Fine-tune what {permTarget?.full_name || "this member"} ({inviteRoleLabel(permTarget?.role)}) can do.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            {permTarget && STAFF_PERMISSIONS.map((p) => (
              <div key={p.key} className="flex items-start gap-3 p-3 rounded-2xl border border-border">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  <p className="text-[11px] text-muted-foreground">{p.description}</p>
                </div>
                <Switch
                  checked={permValue(permTarget.user_id, p.key)}
                  onCheckedChange={(v) => togglePermission(permTarget, p.key, v)}
                />
              </div>
            ))}
            {permTarget && profileRoleToInviteRole(permTarget.role) === "owner" && (
              <p className="text-[11px] text-amber-700">Owners always keep every capability regardless of these toggles.</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setPermTarget(null)} className="rounded-xl w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change role */}
      <Dialog open={!!roleTarget} onOpenChange={(o) => !o && setRoleTarget(null)}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Change role</DialogTitle>
            <DialogDescription className="text-xs">
              Update the role for {roleTarget?.full_name || "this member"}.
            </DialogDescription>
          </DialogHeader>
          <select
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value as InviteRole)}
            className="h-10 w-full rounded-xl border border-emerald-200 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="New role"
          >
            <option value="salesman">Salesman</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner (full access)</option>
          </select>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setRoleTarget(null)} className="rounded-xl flex-1">Cancel</Button>
            <Button onClick={handleChangeRole} disabled={busy} className="rounded-xl flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
              {busy ? "Saving..." : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend */}
      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Suspend access</DialogTitle>
            <DialogDescription className="text-xs space-y-1">
              <span>{suspendTarget?.full_name || "This member"} will have their session terminated immediately and will be blocked from logging into the shop.</span>
              {isOwner ? (
                <span className="block text-slate-500 font-medium">As Owner, suspensions initiated by you cannot be lifted by managers.</span>
              ) : (
                <span className="block text-slate-500 font-medium">As Manager, you or the shop owner can lift this suspension later.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            className="rounded-xl min-h-[60px]"
          />
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setSuspendTarget(null)} className="rounded-xl flex-1">Cancel</Button>
            <Button
              onClick={() => suspendTarget && toggleSuspend(suspendTarget, true, suspendReason)}
              disabled={busy}
              className="rounded-xl flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {busy ? "Suspending..." : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-3xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from shop?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {removeTarget?.full_name || "This member"} will lose access to {"your shop's"} data immediately. Past sales stay in your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="rounded-xl flex-1 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveStaff} className="rounded-xl flex-1 bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invitation link dialog */}
      <Dialog open={linkDialog.open} onOpenChange={(o) => setLinkDialog((d) => ({ ...d, open: o }))}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Invitation Link Ready</DialogTitle>
            <DialogDescription className="text-xs">
              Share this link with <span className="font-medium text-foreground">{linkDialog.email}</span> ({inviteRoleLabel(linkDialog.role)}). It expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 p-3 rounded-2xl bg-muted border border-emerald-100 break-all text-xs text-foreground font-mono select-all">
            {linkDialog.url}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLinkDialog((d) => ({ ...d, open: false }))} className="rounded-xl flex-1">
              Close
            </Button>
            <Button onClick={() => handleCopyLink(linkDialog.url)} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1">
              <Copy size={14} /> Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffManagement;
