import { CalendarDays } from "lucide-react";
import { formatDuration } from "@/lib/deviceInfo";
import type { DutySummary } from "@/components/staff/DutyCard";

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
    <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
  </div>
);

const MonthlySummaryCard = ({ summary }: { summary: DutySummary | null }) => {
  const pending = Number(summary?.pending_deletions ?? 0) + Number(summary?.pending_discounts ?? 0);
  return (
    <div className="p-3 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarDays size={13} className="text-sky-600" />
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Month to date</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Cell label="Hours worked" value={formatDuration(Number(summary?.duty_seconds_month ?? 0))} />
        <Cell label="Total break" value={formatDuration(Number(summary?.break_seconds_month ?? 0))} />
        <Cell label="Invoices" value={String(summary?.invoices_month ?? 0)} />
        <Cell label="Pending" value={String(pending)} />
      </div>

    </div>
  );
};

export default MonthlySummaryCard;
