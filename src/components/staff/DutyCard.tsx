import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Square, Lock, Receipt, Clock, Pause, Coffee } from "lucide-react";
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
  <div className="min-w-0">
    <div className="flex items-center gap-1 mb-0.5">
      {icon}
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
    </div>
    <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
  </div>
);

const DutyCard = ({
  summary,
  staffName,
  userId,
  canControl,
  onChanged,
}: {
  summary: DutySummary | null;
  staffName: string;
  userId: string | null;
  canControl: boolean;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);

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
      ? `🟠 On break since ${timeOf(summary?.break_started_at ?? null)}`
      : `🟢 On duty since ${timeOf(summary?.shift_started_at ?? null)}`;

  const statusCls = !onDuty
    ? "text-muted-foreground"
    : onBreak
      ? "text-amber-600 font-semibold"
      : "text-emerald-600 font-semibold";

  return (
    <div className="p-3 rounded-2xl bg-card border border-border space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{staffName}</p>
          <p className="text-xs">
            <span className={statusCls}>{statusLine}</span>
          </p>
        </div>
        {canControl && userId && (
          <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
            {!onDuty && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run("admin_start_shift", "Shift started")}
                className="rounded-xl gap-1.5"
              >
                <Play size={13} />
                Start Shift
              </Button>
            )}
            {onDuty && !onBreak && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run("admin_pause_shift", "Break started")}
                className="rounded-xl gap-1.5 text-amber-600 border-amber-200 hover:text-amber-700"
              >
                <Pause size={13} />
                Take Break
              </Button>
            )}
            {onBreak && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run("admin_resume_shift", "Duty resumed")}
                className="rounded-xl gap-1.5"
              >
                <Play size={13} />
                Resume Duty
              </Button>
            )}
            {onDuty && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run("admin_stop_shift", "Shift stopped")}
                className="rounded-xl gap-1.5"
              >
                <Square size={13} />
                Stop Shift
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border">
        <Metric
          icon={<Clock size={11} className="text-sky-600" />}
          label="Duty today"
          value={formatDuration(Number(summary?.duty_seconds_today ?? 0))}
        />
        <Metric
          icon={<Coffee size={11} className="text-amber-600" />}
          label="Break today"
          value={formatDuration(Number(summary?.break_seconds_today ?? 0))}
        />
        <Metric
          icon={<Receipt size={11} className="text-emerald-600" />}
          label="Invoices"
          value={String(summary?.invoices_today ?? 0)}
        />
        <Metric
          icon={<Receipt size={11} className="text-emerald-600" />}
          label="Sales"
          value={`৳${Math.round(Number(summary?.sales_amount_today ?? 0)).toLocaleString("en-IN")}`}
        />
      </div>


      {canControl && userId && (
        <label className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <span className="flex items-center gap-1.5 min-w-0">
            <Lock size={13} className="text-destructive shrink-0" />
            <span className="text-xs text-foreground font-medium">Remote lock (read-only)</span>
          </span>
          <Switch
            checked={Boolean(summary?.is_read_only)}
            disabled={busy}
            onCheckedChange={(v) => void toggleLock(v)}
          />
        </label>
      )}
    </div>
  );
};

export default DutyCard;
