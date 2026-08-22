import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/deviceInfo";
import { inviteRoleLabel, profileRoleToInviteRole } from "@/lib/staffRoles";

export interface PresenceRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  clock_in: string | null;
  active_seconds: number;
  idle_seconds: number;
  last_heartbeat_at: string | null;
}

type Status = "online" | "idle" | "offline";

const statusOf = (hb: string | null): Status => {
  if (!hb) return "offline";
  const mins = (Date.now() - new Date(hb).getTime()) / 60000;
  if (mins < 3) return "online";
  if (mins < 20) return "idle";
  return "offline";
};

const STATUS_META: Record<Status, { label: string; dot: string; cls: string }> = {
  online: { label: "Online", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  idle: { label: "Idle", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  offline: { label: "Offline", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const clockTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

const StaffPresenceStrip = ({ userFilter }: { userFilter: string }) => {
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.rpc("get_staff_presence_today" as any);
      if (!active) return;
      setRows(
        ((data as any[]) || []).map((r) => ({
          ...r,
          active_seconds: Number(r.active_seconds || 0),
          idle_seconds: Number(r.idle_seconds || 0),
        })) as PresenceRow[],
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = userFilter === "all" ? rows : rows.filter((r) => r.user_id === userFilter);

  if (loading) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Today’s presence</p>
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No shift activity recorded today</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {visible.map((r) => {
            const st = STATUS_META[statusOf(r.last_heartbeat_at)];
            const name = r.full_name || "Member";
            return (
              <div
                key={r.user_id}
                className="shrink-0 w-[178px] p-3 rounded-2xl bg-card border border-border"
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={r.avatar_url || undefined} alt={name} />
                      <AvatarFallback className="text-[11px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-card ${st.dot}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {inviteRoleLabel(profileRoleToInviteRole(r.role))}
                    </p>
                  </div>
                </div>

                <Badge variant="outline" className={`mt-2 text-[9px] rounded-md py-0 h-4 ${st.cls}`}>
                  {st.label}
                </Badge>

                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">In</p>
                    <p className="text-[11px] font-semibold tabular-nums">{clockTime(r.clock_in)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Active</p>
                    <p className="text-[11px] font-semibold tabular-nums">{formatDuration(r.active_seconds)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-muted-foreground">Idle</p>
                    <p className="text-[11px] font-semibold tabular-nums">{formatDuration(r.idle_seconds)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StaffPresenceStrip;
