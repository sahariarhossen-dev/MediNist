import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertOctagon, ChevronRight, Clock, Search, ShieldAlert, ShieldCheck, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDuration } from "@/lib/deviceInfo";
import { relativeTime } from "@/lib/relativeTime";
import LogDiffDrawer, { type DiffChange, type DiffLog } from "@/components/staff/LogDiffDrawer";

const PAGE = 25;


export type Severity = "info" | "shift" | "audit" | "high_risk" | "security";

interface FeedItem {
  id: string;
  user_id: string;
  action_type: string;
  description: string | null;
  amount: number | null;
  severity: Severity;
  created_at: string;
  changes: DiffChange[];
}




export interface FeedStaffOption {
  user_id: string;
  full_name: string | null;
}

const FILTERS: { key: "all" | Severity; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high_risk", label: "High risk" },
  { key: "audit", label: "Audit" },
  { key: "shift", label: "Shifts" },
];

const badgeFor = (s: Severity) => {
  switch (s) {
    case "high_risk":
      return { label: "High Risk", cls: "bg-destructive/10 text-destructive border-destructive/20", rail: "bg-destructive" };
    case "audit":
      return { label: "Audit Alert", cls: "bg-amber-100 text-amber-800 border-amber-200", rail: "bg-amber-500" };
    case "security":
      return { label: "Security", cls: "bg-violet-100 text-violet-800 border-violet-200", rail: "bg-violet-500" };
    case "shift":
      return { label: "Shift Log", cls: "bg-sky-100 text-sky-800 border-sky-200", rail: "bg-sky-500" };
    default:
      return { label: "Info", cls: "bg-muted text-muted-foreground border-border", rail: "bg-muted-foreground/40" };
  }
};

const iconFor = (s: Severity) =>
  s === "high_risk" ? <AlertOctagon size={14} className="text-destructive" />
  : s === "audit" ? <ShieldAlert size={14} className="text-amber-600" />
  : s === "security" ? <KeyRound size={14} className="text-violet-600" />
  : s === "shift" ? <Clock size={14} className="text-sky-600" />
  : <ShieldCheck size={14} className="text-emerald-600" />;

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

const changesOf = (metadata: unknown): DiffChange[] => {
  const raw = (metadata as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const o = c as Record<string, unknown>;
      return {
        field: String(o.field ?? "Field"),
        old: o.old == null ? null : String(o.old),
        new: o.new == null ? null : String(o.new),
      };
    });
};


const ActivityFeed = ({
  nameOf,
  userFilter = "all",
  refreshKey = 0,
  filter,
  onFilterChange,
}: {
  nameOf: (id: string) => string;
  userFilter?: string;
  refreshKey?: number;
  filter?: "all" | Severity;
  onFilterChange?: (f: "all" | Severity) => void;
}) => {
  const { profile } = useAuth();
  const [rows, setRows] = useState<FeedItem[]>([]);
  const [innerFilter, setInnerFilter] = useState<"all" | Severity>("all");
  const activeFilter = filter ?? innerFilter;
  const setFilter = (f: "all" | Severity) => (onFilterChange ? onFilterChange(f) : setInnerFilter(f));

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [openLog, setOpenLog] = useState<DiffLog | null>(null);


  const fetchPage = useCallback(
    async (before: string | null, replace: boolean) => {
      if (!profile?.pharmacy_id) return;

      const wantLogs = activeFilter !== "shift";
      const wantShifts = activeFilter === "all" || activeFilter === "shift";

      const logsPromise = (async (): Promise<FeedItem[]> => {
        if (!wantLogs) return [];
        let q = supabase
          .from("staff_activity_logs" as any)
          .select("id,user_id,action_type,description,amount,severity,created_at,metadata")
          .eq("pharmacy_id", profile.pharmacy_id)
          .order("created_at", { ascending: false })
          .limit(PAGE);
        if (activeFilter !== "all") q = q.eq("severity", activeFilter);
        if (userFilter !== "all") q = q.eq("user_id", userFilter);
        if (before) q = q.lt("created_at", before);
        // Routine (info-level) sale entries are never shown in this feed
        q = q.or("action_type.neq.sale_create,severity.neq.info");
        const { data } = await q;
        return ((data as any[]) || []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          action_type: r.action_type,
          description: r.description,
          amount: r.amount,
          severity: (r.severity || "info") as Severity,
          created_at: r.created_at,
          changes: changesOf(r.metadata),
        }));
      })();

      const shiftsPromise = (async (): Promise<FeedItem[]> => {
        if (!wantShifts) return [];
        let q = supabase
          .from("staff_shifts" as any)
          .select("id,user_id,started_at,ended_at,device_label,active_seconds")
          .eq("pharmacy_id", profile.pharmacy_id)
          .order("started_at", { ascending: false })
          .limit(PAGE);
        if (userFilter !== "all") q = q.eq("user_id", userFilter);
        if (before) q = q.lt("started_at", before);
        const { data } = await q;
        return ((data as any[]) || []).map((r) => ({
          id: `shift-${r.id}`,
          user_id: r.user_id,
          action_type: "shift_start",
          description: `Duty started${r.device_label ? ` · ${r.device_label}` : ""}${
            r.ended_at ? ` · ${formatDuration(Number(r.active_seconds || 0))} on duty` : " · on duty now"
          }`,
          amount: null,
          severity: "shift" as Severity,
          created_at: r.started_at,
          changes: [],
        }));

      })();

      const [logs, shifts] = await Promise.all([logsPromise, shiftsPromise]);
      const page = [...logs, ...shifts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      const noMore =
        (!wantLogs || logs.length < PAGE) && (!wantShifts || shifts.length < PAGE);
      setExhausted(noMore || page.length === 0);
      setCursor(page.length ? page[page.length - 1].created_at : before);
      setRows((prev) => (replace ? page : [...prev, ...page]));
    },
    [profile?.pharmacy_id, activeFilter, userFilter],
  );

  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    setLoading(true);
    void (async () => {
      await fetchPage(null, true);
      setLoading(false);
    })();
  }, [profile?.pharmacy_id, fetchPage, refreshKey]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        nameOf(r.user_id).toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        r.action_type.replace(/_/g, " ").includes(q),
    );
  }, [rows, search, nameOf]);

  const grouped = useMemo(() => {
    const out: { label: string; items: FeedItem[] }[] = [];
    filtered.forEach((r) => {
      const label = dayLabel(r.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    });
    return out;
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 h-8 rounded-xl text-xs font-medium whitespace-nowrap border transition ${
              activeFilter === f.key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-card text-muted-foreground border-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search person or action"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
        />
      </div>



      {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading activity…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No activity matches this view</p>
      )}

      {grouped.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground pt-1">{group.label}</p>
          {group.items.map((a) => {
            const sev = a.severity;
            const b = badgeFor(sev);
            const hasDiff = a.changes.length > 0;
            return (
              <div
                key={a.id}
                role={hasDiff ? "button" : undefined}
                tabIndex={hasDiff ? 0 : undefined}
                onClick={
                  hasDiff
                    ? () =>
                        setOpenLog({
                          id: a.id,
                          staffName: nameOf(a.user_id),
                          action_type: a.action_type,
                          description: a.description,
                          amount: a.amount,
                          created_at: a.created_at,
                          changes: a.changes,
                        })
                    : undefined
                }
                className={`relative overflow-hidden p-3 pl-4 bg-card rounded-2xl border border-border ${
                  hasDiff ? "cursor-pointer active:scale-[0.99] transition" : ""
                }`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${b.rail}`} />
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{iconFor(sev)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-semibold text-foreground truncate flex-1">{nameOf(a.user_id)}</p>
                      <Badge variant="outline" className={`text-[9px] rounded-md py-0 h-4 shrink-0 ${b.cls}`}>
                        {b.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground break-words">
                      {a.description || a.action_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 tabular-nums mt-0.5">
                      {relativeTime(a.created_at)}
                      {a.amount ? ` · ${money(Number(a.amount))}` : ""}
                    </p>
                  </div>
                  {hasDiff && (
                    <ChevronRight size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {!loading && !exhausted && filtered.length > 0 && (
        <Button
          variant="outline"
          className="w-full rounded-xl"
          disabled={more}
          onClick={async () => {
            setMore(true);
            await fetchPage(cursor, false);
            setMore(false);
          }}
        >
          {more ? "Loading…" : "Load more"}
        </Button>
      )}

      <LogDiffDrawer log={openLog} onOpenChange={(o) => !o && setOpenLog(null)} />
    </div>
  );
};

export default ActivityFeed;
