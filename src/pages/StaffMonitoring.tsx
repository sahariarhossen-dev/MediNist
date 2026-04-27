import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ShoppingCart, Wallet, LogIn, LogOut, AlertTriangle,
  LockKeyhole, ShieldAlert, ShieldCheck, ShieldX, HandCoins, Trash2,
  Pencil, Activity, Eye,
} from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Member = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  last_seen: string | null;
};

type LogRow = {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string | null;
  description: string | null;
  amount: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type ClosingRow = {
  id: string;
  closing_date: string;
  closed_by_user_id: string | null;
  declared_cash: number | null;
  system_cash: number | null;
  discrepancy: number | null;
  notes: string | null;
};

type PulseCategory = "sale" | "expense" | "login" | "edit" | "closing" | "other";

const CATEGORY: Record<string, { cat: PulseCategory; label: string; Icon: typeof Activity }> = {
  sale_create: { cat: "sale", label: "Sale", Icon: ShoppingCart },
  payment_received: { cat: "sale", label: "Payment Received", Icon: HandCoins },
  transaction_create: { cat: "expense", label: "Cash Transaction", Icon: Wallet },
  transaction_delete: { cat: "expense", label: "Transaction Deleted", Icon: Trash2 },
  sale_delete: { cat: "expense", label: "Sale Deleted", Icon: Trash2 },
  closing_discrepancy: { cat: "expense", label: "Cash Discrepancy", Icon: AlertTriangle },
  login: { cat: "login", label: "Login", Icon: LogIn },
  logout: { cat: "login", label: "Logout", Icon: LogOut },
  sale_update: { cat: "edit", label: "Sale Edited", Icon: Pencil },
  transaction_update: { cat: "edit", label: "Transaction Edited", Icon: Pencil },
  override_request: { cat: "edit", label: "Override Requested", Icon: ShieldAlert },
  override_approved: { cat: "edit", label: "Override Approved", Icon: ShieldCheck },
  override_denied: { cat: "edit", label: "Override Denied", Icon: ShieldX },
  blind_closing: { cat: "closing", label: "Shift Closing", Icon: LockKeyhole },
};

const CAT_STYLE: Record<PulseCategory, { dot: string; ring: string; chip: string }> = {
  sale:    { dot: "bg-emerald-500", ring: "ring-emerald-100", chip: "bg-emerald-50 text-emerald-700" },
  expense: { dot: "bg-rose-500",    ring: "ring-rose-100",    chip: "bg-rose-50 text-rose-700" },
  login:   { dot: "bg-sky-500",     ring: "ring-sky-100",     chip: "bg-sky-50 text-sky-700" },
  edit:    { dot: "bg-amber-500",   ring: "ring-amber-100",   chip: "bg-amber-50 text-amber-700" },
  closing: { dot: "bg-indigo-500",  ring: "ring-indigo-100",  chip: "bg-indigo-50 text-indigo-700" },
  other:   { dot: "bg-slate-400",   ring: "ring-slate-100",   chip: "bg-slate-50 text-slate-700" },
};

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const initials = (name: string | null) =>
  (name || "?").split(" ").filter(Boolean).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const FILTERS: Array<{ key: "all" | PulseCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "sale", label: "Sales" },
  { key: "expense", label: "Expenses" },
  { key: "login", label: "Logins" },
];

const StaffMonitoring = () => {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const isOwner = profile?.role === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [filter, setFilter] = useState<"all" | PulseCategory>("all");
  const [now, setNow] = useState(Date.now());

  // Tick every 30s so live dot + relative times stay fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const memberMap = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((mm) => m.set(mm.user_id, mm));
    return m;
  }, [members]);

  const fetchMembers = useCallback(async () => {
    const { data } = await (supabase as any).rpc("get_pharmacy_member_presence");
    setMembers(((data as any) ?? []) as Member[]);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    const { data } = await supabase
      .from("staff_activity_logs")
      .select("id,user_id,action_type,entity_type,description,amount,created_at,metadata")
      .eq("pharmacy_id", profile.pharmacy_id)
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(((data as any) ?? []) as LogRow[]);
  }, [profile?.pharmacy_id]);

  const fetchClosings = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    const since = format(subDays(new Date(), 7), "yyyy-MM-dd");
    const { data } = await supabase
      .from("daily_closings")
      .select("id,closing_date,closed_by_user_id,declared_cash,system_cash,discrepancy,notes")
      .eq("pharmacy_id", profile.pharmacy_id)
      .eq("closing_type", "manual")
      .gte("closing_date", since)
      .not("discrepancy", "is", null)
      .order("closing_date", { ascending: false });
    setClosings(((data as any) ?? []) as ClosingRow[]);
  }, [profile?.pharmacy_id]);

  useEffect(() => {
    if (!isOwner) return;
    fetchMembers();
    fetchLogs();
    fetchClosings();
  }, [isOwner, fetchMembers, fetchLogs, fetchClosings]);

  // Realtime: prepend new logs, refresh closings & presence
  useEffect(() => {
    if (!isOwner || !profile?.pharmacy_id) return;
    const filterStr = `pharmacy_id=eq.${profile.pharmacy_id}`;
    const channel = supabase
      .channel(`staff-monitoring-${profile.pharmacy_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_activity_logs", filter: filterStr },
        (payload) => setLogs((prev) => [payload.new as LogRow, ...prev].slice(0, 100)),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_closings", filter: filterStr },
        () => fetchClosings(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `pharmacy_id=eq.${profile.pharmacy_id}` },
        () => fetchMembers(),
      )
      .subscribe();
    // Also poll presence every 60s for users we haven't seen update
    const presencePoll = setInterval(fetchMembers, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(presencePoll);
    };
  }, [isOwner, profile?.pharmacy_id, fetchClosings, fetchMembers]);

  if (loading) return null;
  if (!isOwner) return <Navigate to="/more" replace />;

  const filteredLogs = logs.filter((l) => {
    if (filter === "all") return true;
    const meta = CATEGORY[l.action_type];
    return meta?.cat === filter;
  });

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1" aria-label="Back">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 leading-tight">Staff Monitoring</h1>
            <p className="text-[11px] text-gray-500 leading-tight">Real-time activity & presence</p>
          </div>
        </div>
      </div>

      {/* Active Staff strip */}
      <section className="px-page pt-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 tracking-tight">Active Staff</h2>
          <span className="text-[11px] text-gray-500">
            {members.filter((m) => m.last_seen && now - new Date(m.last_seen).getTime() < ACTIVE_WINDOW_MS).length}
            {" / "}{members.length} online
          </span>
        </div>
        {members.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-xs text-gray-500">No staff in this pharmacy yet.</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
            {members.map((m) => {
              const seenMs = m.last_seen ? new Date(m.last_seen).getTime() : 0;
              const active = seenMs && now - seenMs < ACTIVE_WINDOW_MS;
              return (
                <div key={m.user_id} className="flex-shrink-0 w-20 flex flex-col items-center">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700 overflow-hidden">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.full_name || ""} className="w-full h-full object-cover" />
                      ) : (
                        initials(m.full_name)
                      )}
                    </div>
                    <span
                      className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
                        active ? "bg-emerald-500" : "bg-gray-300"
                      } ${active ? "animate-pulse" : ""}`}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-gray-900 truncate w-full text-center">
                    {m.full_name?.split(" ")[0] || "—"}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate w-full text-center">
                    {active
                      ? "Active now"
                      : seenMs
                        ? formatDistanceToNow(seenMs, { addSuffix: true })
                        : "Never"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Discrepancy Report (Owner only) */}
      <section className="px-page pt-7">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 tracking-tight">Discrepancy Report</h2>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
            <Eye size={10} /> Owner only
          </span>
        </div>
        <div className="bg-white rounded-2xl shadow-sm">
          {closings.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheck className="mx-auto mb-2 text-emerald-300" size={28} />
              <p className="text-sm text-gray-500">No discrepancies recorded.</p>
              <p className="text-[11px] text-gray-400 mt-0.5">All shift counts match the system total.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {closings.map((c) => {
                const v = Number(c.discrepancy ?? 0);
                const exact = v === 0;
                const variantText = exact
                  ? "text-emerald-600"
                  : v > 0
                    ? "text-amber-600"
                    : "text-rose-600";
                const variantBg = exact
                  ? "bg-emerald-50"
                  : v > 0
                    ? "bg-amber-50"
                    : "bg-rose-50";
                const label = exact ? "Match" : v > 0 ? "Surplus" : "Shortage";
                const staffName = c.closed_by_user_id
                  ? memberMap.get(c.closed_by_user_id)?.full_name || "Unknown"
                  : "Unknown";
                return (
                  <div key={c.id} className="p-4">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{staffName}</p>
                        <p className="text-[11px] text-gray-500">
                          {format(new Date(c.closing_date), "EEE, dd MMM yyyy")}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${variantBg} ${variantText}`}>
                        {label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Declared</p>
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">৳{formatBDT(Number(c.declared_cash ?? 0))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">System</p>
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">৳{formatBDT(Number(c.system_cash ?? 0))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Variance</p>
                        <p className={`text-sm font-bold tabular-nums ${variantText}`}>
                          {v > 0 ? "+" : ""}৳{formatBDT(Math.abs(v))}
                        </p>
                      </div>
                    </div>
                    {c.notes && (
                      <p className="mt-3 text-[11px] text-gray-500 italic line-clamp-2">"{c.notes}"</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Pulse Feed */}
      <section className="px-page pt-7">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 tracking-tight">Pulse Feed</h2>
          <span className="text-[11px] text-gray-500">Live</span>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-3 h-7 rounded-full text-[11px] font-medium transition-colors ${
                filter === f.key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredLogs.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <Activity className="mx-auto mb-2 text-gray-300" size={28} />
            <p className="text-sm text-gray-500">Quiet day so far.</p>
            <p className="text-[11px] text-gray-400 mt-0.5">New activity will appear here in real time.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <ol className="relative">
              <span className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-100" aria-hidden />
              {filteredLogs.map((l) => {
                const meta = CATEGORY[l.action_type] ?? { cat: "other" as PulseCategory, label: l.action_type, Icon: Activity };
                const style = CAT_STYLE[meta.cat];
                const Icon = meta.Icon;
                const staffName = memberMap.get(l.user_id)?.full_name || "Unknown Staff";
                return (
                  <li key={l.id} className="relative pl-10 pb-5 last:pb-0">
                    <span
                      className={`absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center text-white ring-4 ${style.dot} ${style.ring}`}
                    >
                      <Icon size={14} />
                    </span>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{staffName}</p>
                      <p className="text-[11px] text-gray-400 whitespace-nowrap">
                        {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-600 line-clamp-2 min-w-0">
                        {l.description || meta.label}
                      </p>
                      {l.amount != null && (
                        <p className={`text-xs font-bold tabular-nums whitespace-nowrap ${meta.cat === "sale" ? "text-emerald-600" : meta.cat === "expense" ? "text-rose-600" : "text-gray-700"}`}>
                          ৳{formatBDT(Number(l.amount))}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
};

export default StaffMonitoring;
