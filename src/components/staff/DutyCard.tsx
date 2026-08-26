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

  const toggleShift = async () => {
    if (!userId) return;
    setBusy(true);
    const fn = summary?.shift_open ? "admin_stop_shift" : "admin_start_shift";
    const { error } = await supabase.rpc(fn as any, { _user_id: userId });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(summary?.shift_open ? "Shift stopped" : "Shift started");
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

  return (
    <div className="p-3 rounded-2xl bg-card border border-border space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{staffName}</p>
          <p className="text-xs text-muted-foreground">
            <span className={onDuty ? "text-emerald-600 font-semibold" : ""}>
              {onDuty ? `On duty since ${timeOf(summary?.shift_started_at ?? null)}` : "Off duty"}
            </span>
          </p>
        </div>
        {canControl && userId && (
          <Button
            size="sm"
            variant={onDuty ? "outline" : "default"}
            disabled={busy}
            onClick={toggleShift}
            className="rounded-xl gap-1.5 shrink-0"
          >
            {onDuty ? <Square size={13} /> : <Play size={13} />}
            {onDuty ? "Stop Shift" : "Start Shift"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
        <Metric
          icon={<Clock size={11} className="text-sky-600" />}
          label="Duty today"
          value={formatDuration(Number(summary?.duty_seconds_today ?? 0))}
        />
        <Metric
          icon={<Receipt size={11} className="text-emerald-600" />}
          label="Invoices today"
          value={String(summary?.invoices_today ?? 0)}
        />
        <Metric
          icon={<Receipt size={11} className="text-emerald-600" />}
          label="Sales today"
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
