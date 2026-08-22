import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Send, AlertTriangle, Trash2, Copy, Megaphone, Trophy, ChevronRight,
  Search, MoreVertical, ShieldCheck, PauseCircle, PlayCircle, UserCog, SlidersHorizontal,
  Activity, Users,
} from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { STAFF_PERMISSIONS, inviteRoleLabel, profileRoleToInviteRole, type InviteRole } from "@/lib/staffRoles";

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
  last_seen: string | null;
}

interface ActivityRow {
  id: string;
  user_id: string;
  action_type: string;
  description: string | null;
  amount: number | null;
  created_at: string;
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

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

const StaffManagement = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [overview, setOverview] = useState<StaffOverviewRow[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [broadcastDraft, setBroadcastDraft] = useState("");
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [targetType, setTargetType] = useState<BroadcastTarget>("all");
  const [roleTargetValue, setRoleTargetValue] = useState<"salesman" | "manager">("salesman");
  const [targetUser, setTargetUser] = useState<string>("");
  const [targetUserSearch, setTargetUserSearch] = useState("");
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
  }, [profile?.pharmacy_id, isAdmin]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchOverview(),
      fetchBroadcast(),
      isAdmin ? fetchStaff() : Promise.resolve(),
      isAdmin ? fetchPermissions() : Promise.resolve(),
      isAdmin ? fetchActivity() : Promise.resolve(),
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
    const { data } = await supabase.rpc("get_pharmacy_staff_overview" as any);
    if (data) {
      const rows = (data as unknown as StaffOverviewRow[])
        .map((r) => ({
          ...r,
          month_sales: Number(r.month_sales || 0),
          monthly_target: Number(r.monthly_target || 0),
          month_count: Number(r.month_count || 0),
          commission_percent: Number(r.commission_percent || 0),
          basic_salary: Number(r.basic_salary || 0),
        }))
        .sort((a, b) => b.month_sales - a.month_sales);
      setOverview(rows);
    }
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

  const fetchActivity = async () => {
    const { data } = await supabase
      .from("staff_activity_logs" as any)
      .select("id,user_id,action_type,description,amount,created_at")
      .eq("pharmacy_id", profile!.pharmacy_id!)
      .order("created_at", { ascending: false })
      .limit(40);
    if (data) setActivity(data as unknown as ActivityRow[]);
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
    setTargetUserSearch("");
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


  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email) || email.length > 255) {
      toast({ title: "Invalid email", description: "Enter a valid email like name@example.com.", variant: "destructive" });
      return;
    }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-staff", { body: { email, role: inviteRole } });
    setInviting(false);
    if (error || data?.error) {
      toast({ title: "Invitation failed", description: await extractInvokeError(error, data), variant: "destructive" });
      return;
    }
    setLinkDialog({ open: true, email: data?.email ?? email, role: data?.role ?? inviteRole, url: data?.acceptUrl ?? "" });
    setInviteEmail("");
    fetchStaff();
  };

  const handleResendInvite = async (email: string, role: string) => {
    const { data, error } = await supabase.functions.invoke("invite-staff", { body: { email, role } });
    if (error || data?.error) {
      toast({ title: "Resend failed", description: await extractInvokeError(error, data), variant: "destructive" });
      return;
    }
    setLinkDialog({ open: true, email: data?.email ?? email, role: data?.role ?? role, url: data?.acceptUrl ?? "" });
    fetchStaff();
  };

  const handleRevokeInvite = async (id: string) => {
    const { error } = await supabase.from("shop_staff").update({ status: "revoked" } as any).eq("id", id);
    if (error) { toast({ title: "Revoke failed", description: error.message, variant: "destructive" }); return; }
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, status: "revoked" } : s)));
    toast({ title: "Invitation revoked" });
  };

  const handleDeleteInvite = async (id: string) => {
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
    setBusy(true);
    const { error } = await supabase.from("staff_access" as any).upsert(
      {
        pharmacy_id: profile.pharmacy_id,
        user_id: row.user_id,
        is_suspended: suspend,
        suspended_at: suspend ? new Date().toISOString() : null,
        suspend_reason: suspend ? (reason?.trim() || null) : null,
        updated_by: profile.id,
      } as any,
      { onConflict: "user_id" },
    );
    setBusy(false);
    if (error) {
      toast({ title: suspend ? "Suspend failed" : "Reactivate failed", description: error.message, variant: "destructive" });
      return;
    }
    setOverview((prev) => prev.map((r) => (r.user_id === row.user_id ? { ...r, is_suspended: suspend } : r)));
    setSuspendTarget(null);
    setSuspendReason("");
    toast({ title: suspend ? `${row.full_name || "Staff"} suspended` : `${row.full_name || "Staff"} reactivated` });
  };

  const handleChangeRole = async () => {
    if (!roleTarget) return;
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
    setBusy(true);
    const { error } = await supabase.rpc("admin_remove_staff" as any, { _user_id: removeTarget.user_id });
    setBusy(false);
    if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${removeTarget.full_name || "Staff member"} removed` });
    setRemoveTarget(null);
    await loadAll();
  };

  const togglePermission = async (row: StaffOverviewRow, key: string, enabled: boolean) => {
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

  const pendingInvites = useMemo(
    () => staff.filter((s) => s.status !== "accepted" && s.status !== "active"),
    [staff],
  );

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

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-muted" aria-label="Go back">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
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
            {isAdmin && (
              <TabsTrigger value="invites" className="flex-1 rounded-xl gap-1.5">
                <Send size={14} /> Invites
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="activity" className="flex-1 rounded-xl gap-1.5">
                <Activity size={14} /> Activity
              </TabsTrigger>
            )}
          </TabsList>

          {/* ---------------- TEAM ---------------- */}
          <TabsContent value="team" className="mt-4 space-y-3">
            {isAdmin && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <Megaphone size={14} className="text-amber-700" />
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Internal Broadcast</p>
                </div>
                <Textarea
                  placeholder="Post a notice for all staff (e.g., Meeting at 5 PM)"
                  value={broadcastDraft}
                  onChange={(e) => setBroadcastDraft(e.target.value)}
                  className="rounded-xl bg-white border-amber-200 text-sm min-h-[60px]"
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={handleSaveBroadcast}
                    disabled={savingBroadcast || !broadcastDraft.trim()}
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white h-9 flex-1 gap-2"
                  >
                    <Send size={14} /> {savingBroadcast ? "Posting..." : broadcast ? "Update" : "Post"}
                  </Button>
                  {broadcast && (
                    <Button onClick={handleClearBroadcast} variant="outline" className="rounded-xl h-9 border-amber-200 text-amber-700">
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Top performer */}
            {overview.length > 0 && overview[0].month_sales > 0 && (
              <button
                onClick={() => navigate(`/staff/${overview[0].user_id}`)}
                className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-200/70">
                    <Trophy size={20} className="text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Top Performer · This Month</p>
                    <p className="text-sm font-bold text-foreground truncate">{overview[0].full_name || "Unnamed"}</p>
                    <p className="text-xs text-amber-800 tabular-nums">{money(overview[0].month_sales)} in sales</p>
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
                return (
                  <div
                    key={row.user_id}
                    className={`p-3 bg-card rounded-2xl border ${row.is_suspended ? "border-rose-200 bg-rose-50/40" : "border-border"}`}
                  >
                    <div className="flex items-center gap-3">
                      <button onClick={() => navigate(`/staff/${row.user_id}`)} className="relative shrink-0" aria-label="Open staff details">
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={row.avatar_url || undefined} />
                          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">{initials}</AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${dotColor}`} />
                      </button>
                      <button onClick={() => navigate(`/staff/${row.user_id}`)} className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">{row.full_name || "Unnamed"}</p>
                          <Badge variant="secondary" className="text-[9px] rounded-md py-0 h-4">{inviteRoleLabel(row.role)}</Badge>
                          {row.is_suspended && (
                            <Badge className="text-[9px] rounded-md py-0 h-4 bg-rose-100 text-rose-700 border-rose-200">Suspended</Badge>
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

                      {isAdmin && !isSelf ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 rounded-full hover:bg-muted shrink-0" aria-label="Staff actions">
                              <MoreVertical size={16} className="text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl w-52">
                            <DropdownMenuItem onClick={() => navigate(`/staff/${row.user_id}`)} className="gap-2">
                              <ChevronRight size={14} /> View performance
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPermTarget(row)} className="gap-2">
                              <SlidersHorizontal size={14} /> Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => { setRoleTarget(row); setRoleDraft(profileRoleToInviteRole(row.role)); }}
                              className="gap-2"
                            >
                              <UserCog size={14} /> Change role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {row.is_suspended ? (
                              <DropdownMenuItem onClick={() => toggleSuspend(row, false)} className="gap-2 text-emerald-700">
                                <PlayCircle size={14} /> Reactivate access
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => { setSuspendTarget(row); setSuspendReason(""); }} className="gap-2 text-amber-700">
                                <PauseCircle size={14} /> Suspend access
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setRemoveTarget(row)} className="gap-2 text-destructive">
                              <Trash2 size={14} /> Remove from shop
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ---------------- INVITES ---------------- */}
          {isAdmin && (
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
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                    className="flex-1 h-10 rounded-xl border border-emerald-200 bg-background px-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    aria-label="Invite role"
                  >
                    <option value="salesman">Salesman</option>
                    <option value="manager">Manager</option>
                  </select>
                  <Button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    <Send size={14} /> {inviting ? "Sending..." : "Send"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Invitations expire after 7 days.</p>
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
          {isAdmin && (
            <TabsContent value="activity" className="mt-4">
              <div className="space-y-2">
                {activity.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No staff activity recorded yet</p>
                )}
                {activity.map((a) => (
                  <div key={a.id} className="p-3 bg-card rounded-2xl border border-border">
                    <div className="flex items-start gap-2">
                      <ShieldCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">{nameOf(a.user_id)}</span>{" "}
                          <span className="text-muted-foreground">{a.description || a.action_type.replace(/_/g, " ")}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {new Date(a.created_at).toLocaleString("en-GB")}
                          {a.amount ? ` · ${money(Number(a.amount))}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
            <DialogDescription className="text-xs">
              {suspendTarget?.full_name || "This member"} will not be able to record sales or cash movements until reactivated.
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
