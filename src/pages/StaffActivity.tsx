import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Activity, ShoppingCart, Wallet, Trash2, Pencil, ArrowDownCircle, ArrowUpCircle, HandCoins, LockKeyhole, AlertTriangle, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, formatDistanceToNow, startOfDay, subDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LogRow = {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string | null;
  description: string | null;
  amount: number | null;
  created_at: string;
};

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  "7days": "Last 7 Days",
  "30days": "Last 30 Days",
};

function getStartDate(range: string): string {
  const now = new Date();
  if (range === "today") return startOfDay(now).toISOString();
  if (range === "7days") return startOfDay(subDays(now, 7)).toISOString();
  return startOfDay(subDays(now, 30)).toISOString();
}

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const ACTION_META: Record<string, { label: string; Icon: typeof Activity; color: string }> = {
  sale_create: { label: "Sale", Icon: ShoppingCart, color: "bg-green-100 text-green-600" },
  sale_update: { label: "Sale Edited", Icon: Pencil, color: "bg-amber-100 text-amber-600" },
  sale_delete: { label: "Sale Deleted", Icon: Trash2, color: "bg-red-100 text-red-600" },
  transaction_create: { label: "Transaction", Icon: Wallet, color: "bg-blue-100 text-blue-600" },
  transaction_update: { label: "Transaction Edited", Icon: Pencil, color: "bg-amber-100 text-amber-600" },
  transaction_delete: { label: "Transaction Deleted", Icon: Trash2, color: "bg-red-100 text-red-600" },
  payment_received: { label: "Payment Received", Icon: HandCoins, color: "bg-teal-100 text-teal-600" },
  login: { label: "Login", Icon: ArrowDownCircle, color: "bg-gray-100 text-gray-600" },
  logout: { label: "Logout", Icon: ArrowUpCircle, color: "bg-gray-100 text-gray-600" },
  blind_closing: { label: "Shift Closing", Icon: LockKeyhole, color: "bg-indigo-100 text-indigo-600" },
  closing_discrepancy: { label: "Cash Discrepancy", Icon: AlertTriangle, color: "bg-red-100 text-red-600" },
  override_request: { label: "Override Requested", Icon: ShieldAlert, color: "bg-amber-100 text-amber-700" },
  override_approved: { label: "Override Approved", Icon: ShieldCheck, color: "bg-green-100 text-green-600" },
  override_denied: { label: "Override Denied", Icon: ShieldX, color: "bg-red-100 text-red-600" },
};

type OverrideRequest = {
  id: string;
  requested_by: string;
  entity_type: string;
  entity_id: string;
  action: string;
  reason: string | null;
  created_at: string;
  status: string;
};

const StaffActivity = () => {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [range, setRange] = useState("today");
  const [staffFilter, setStaffFilter] = useState("all");
  const [members, setMembers] = useState<Array<{ user_id: string; full_name: string | null }>>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<OverrideRequest[]>([]);

  const isAdmin = profile?.role === "admin";

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mm) => m.set(mm.user_id, mm.full_name || "Unknown"));
    return m;
  }, [members]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase.rpc("get_pharmacy_member_names");
    setMembers((data as any) ?? []);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    setBusy(true);
    let q = supabase
      .from("staff_activity_logs")
      .select("id,user_id,action_type,entity_type,description,amount,created_at")
      .eq("pharmacy_id", profile.pharmacy_id)
      .gte("created_at", getStartDate(range))
      .order("created_at", { ascending: false })
      .limit(500);
    if (staffFilter !== "all") q = q.eq("user_id", staffFilter);
    const { data } = await q;
    setLogs((data as any) ?? []);
    setBusy(false);
  }, [profile?.pharmacy_id, range, staffFilter]);

  const fetchPendingRequests = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    const { data } = await supabase
      .from("admin_override_requests")
      .select("id,requested_by,entity_type,entity_id,action,reason,created_at,status")
      .eq("pharmacy_id", profile.pharmacy_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    setPendingRequests((data as any) ?? []);
  }, [profile?.pharmacy_id]);

  const resolveRequest = async (req: OverrideRequest, decision: "approved" | "denied") => {
    const { error } = await supabase
      .from("admin_override_requests")
      .update({ status: decision, resolved_by: profile?.id ?? null, resolved_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("staff_activity_logs").insert({
      pharmacy_id: profile!.pharmacy_id,
      user_id: profile!.id,
      action_type: decision === "approved" ? "override_approved" : "override_denied",
      entity_type: req.entity_type,
      entity_id: req.entity_id,
      description: `${decision === "approved" ? "Approved" : "Denied"} ${req.action} request`,
    });
    toast.success(`Request ${decision}`);
    fetchPendingRequests();
  };

  useEffect(() => {
    if (isAdmin) fetchMembers();
  }, [isAdmin, fetchMembers]);

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, fetchLogs]);

  useEffect(() => {
    if (isAdmin) fetchPendingRequests();
  }, [isAdmin, fetchPendingRequests]);

  // Realtime
  useEffect(() => {
    if (!isAdmin || !profile?.pharmacy_id) return;
    const channel = supabase
      .channel(`staff-activity-${profile.pharmacy_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_activity_logs", filter: `pharmacy_id=eq.${profile.pharmacy_id}` },
        () => fetchLogs(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_override_requests", filter: `pharmacy_id=eq.${profile.pharmacy_id}` },
        () => fetchPendingRequests(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, profile?.pharmacy_id, fetchLogs, fetchPendingRequests]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/more" replace />;

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    logs.forEach((l) => {
      const key = format(new Date(l.created_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return Array.from(map.entries());
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Staff Activity</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="px-page pt-3 grid grid-cols-2 gap-2">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-9 bg-white text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RANGE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={staffFilter} onValueChange={setStaffFilter}>
          <SelectTrigger className="h-9 bg-white text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Staff</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id} className="text-xs">
                {m.full_name || "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="px-page pt-4 space-y-5">
        {pendingRequests.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 px-1 mb-2 flex items-center gap-1.5">
              <ShieldAlert size={14} /> Pending Override Requests
            </p>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {pendingRequests.map((r) => (
                <div key={r.id} className="p-3">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {memberMap.get(r.requested_by) || "Unknown Staff"}
                    </p>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700">
                    Wants to <span className="font-semibold capitalize">{r.action}</span> {r.entity_type}{" "}
                    <span className="font-mono text-gray-500">#{r.entity_id.slice(0, 6).toUpperCase()}</span>
                  </p>
                  {r.reason && <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">"{r.reason}"</p>}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => resolveRequest(r, "approved")}
                      className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveRequest(r, "denied")}
                      className="h-8 px-3 text-xs"
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {busy && <p className="text-center text-xs text-gray-400 py-8">Loading…</p>}
        {!busy && grouped.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Activity className="mx-auto mb-2 text-gray-300" size={28} />
            <p className="text-sm text-gray-500">No activity recorded for this period.</p>
          </div>
        )}
        {grouped.map(([day, items]) => (
          <div key={day}>
            <p className="text-xs font-semibold text-gray-500 px-1 mb-2">
              {format(new Date(day), "EEEE, dd MMM yyyy")}
            </p>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {items.map((l) => {
                const meta = ACTION_META[l.action_type] ?? {
                  label: l.action_type,
                  Icon: Activity,
                  color: "bg-gray-100 text-gray-600",
                };
                const Icon = meta.Icon;
                return (
                  <div key={l.id} className="flex items-start gap-3 p-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate">
                          {memberMap.get(l.user_id) || "Unknown Staff"}
                        </p>
                        {l.amount != null && (
                          <p className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                            ৳{formatBDT(Number(l.amount))}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {l.description || meta.label}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StaffActivity;
