import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Square, Lock, Receipt, Clock, Pause, Coffee, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDuration } from "@/lib/deviceInfo";

export interface DutySummary {
  invoices_today: number;
  sales_amount_today: number;
  invoices_month: number;
  sales_amount_month: number;
  duty_seconds_today: number;
  duty_seconds_month: number;
  break_seconds_today: number;
  break_seconds_month: number;
  pending_deletions: number;
  pending_discounts: number;
  is_read_only: boolean;
  shift_open: boolean;
  shift_started_at: string | null;
  on_break: boolean;
  break_started_at: string | null;
}

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

const Metric = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="min-w-0 p-3 rounded-xl bg-muted/40">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-normal leading-tight">
        {label}
      </p>
    </div>
    <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
  </div>
);

const DutyCard = ({
  summary,
  userId,
  canControl,
  onChanged,
}: {
  summary: DutySummary | null;
  userId: string | null;
  canControl: boolean;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<"today" | "month">("today");

  const run = async (fn: string, success: string) => {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase.rpc(fn as any, { _user_id: userId });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(success);
      onChanged();
    }
  };

  const toggleLock = async (on: boolean) => {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_staff_read_only" as any, {
      _user_id: userId,
      _on: on,
      _reason: on ? "Locked remotely by the shop owner" : null,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(on ? "Remote lock enabled" : "Remote lock removed");
      onChanged();
    }
  };

  const onDuty = Boolean(summary?.shift_open);
  const onBreak = onDuty && Boolean(summary?.on_break);

  const statusLine = !onDuty
    ? "Off duty"
    : onBreak
      ? `On break since ${timeOf(summary?.break_started_at ?? null)}`
      : `On duty since ${timeOf(summary?.shift_started_at ?? null)}`;

  const dotCls = !onDuty
    ? "bg-muted-foreground/50"
    : onBreak
      ? "bg-amber-500"
      : "bg-emerald-500";

  const statusCls = !onDuty
    ? "text-muted-foreground"
    : onBreak
      ? "text-amber-600"
      : "text-emerald-600";

  const isToday = range === "today";
  const pending = Number(summary?.pending_deletions ?? 0) + Number(summary?.pending_discounts ?? 0);

  return (
    <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
      {/* Header: status + remote lock */}
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${statusCls}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
          {statusLine}
        </p>
        {canControl && userId && (
          <label className="flex items-center gap-1.5 shrink-0" title="Remote lock (read-only)">
            <Lock size={12} className={summary?.is_read_only ? "text-destructive" : "text-muted-foreground"} />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Lock</span>
            <Switch
              checked={Boolean(summary?.is_read_only)}
              disabled={busy}
              onCheckedChange={(v) => void toggleLock(v)}
            />
          </label>
        )}
      </div>

      {/* Action strip */}
      {canControl && userId && (
        <div className="flex gap-2">
          {!onDuty && (
            <Button
              disabled={busy}
              onClick={() => void run("admin_start_shift", "Shift started")}
              className="flex-1 rounded-full h-9 gap-1.5"
            >
              <Play size={13} />
              Start Shift
            </Button>
          )}
          {onDuty && !onBreak && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("admin_pause_shift", "Break started")}
                className="flex-1 rounded-full h-9 gap-1.5 text-amber-600 border-amber-200 hover:text-amber-700"
              >
                <Pause size={13} />
                Take Break
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("admin_stop_shift", "Shift stopped")}
                className="flex-1 rounded-full h-9 gap-1.5"
              >
                <Square size={13} />
                Stop Shift
              </Button>
            </>
          )}
          {onBreak && (
            <Button
              disabled={busy}
              onClick={() => void run("admin_resume_shift", "Duty resumed")}
              className="flex-1 rounded-full h-9 gap-1.5"
            >
              <Play size={13} />
              Resume Duty
            </Button>
          )}
        </div>
      )}

      {/* Range toggle */}
      <div className="flex p-0.5 rounded-full bg-muted/60 w-fit mx-auto">
        {(["today", "month"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`px-4 h-7 rounded-full text-[11px] font-semibold transition ${
              range === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {r === "today" ? "Today" : "This Month"}
          </button>
        ))}
      </div>

      {/* Metrics 2x2 */}
      <div className="grid grid-cols-2 gap-2">
        <Metric
          icon={<Clock size={12} className="text-sky-600 shrink-0" />}
          label="Duty Time"
          value={formatDuration(Number(isToday ? summary?.duty_seconds_today : summary?.duty_seconds_month) || 0)}
        />
        <Metric
          icon={<Coffee size={12} className="text-amber-600 shrink-0" />}
          label="Break Time"
          value={formatDuration(Number(isToday ? summary?.break_seconds_today : summary?.break_seconds_month) || 0)}
        />
        <Metric
          icon={<Receipt size={12} className="text-emerald-600 shrink-0" />}
          label="Invoices"
          value={String(isToday ? summary?.invoices_today ?? 0 : summary?.invoices_month ?? 0)}
        />
        <Metric icon={<Flag size={12} className="text-destructive shrink-0" />} label="Pending" value={String(pending)} />
      </div>
    </div>
  );
};

export default DutyCard;
