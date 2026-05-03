import { CheckCircle2, Clock } from "lucide-react";
import CountdownTimer from "./CountdownTimer";
import { Progress } from "@/components/ui/progress";
import { useCountdown } from "@/hooks/useCountdown";
import { cn } from "@/lib/utils";
import { formatDate, type SubscriptionInfo } from "@/lib/subscriptionMock";

export default function StatusCard({ sub }: { sub: SubscriptionInfo }) {
  const expiry = new Date(sub.expiry_date);
  const { days, diff } = useCountdown(expiry);

  const tone: "emerald" | "amber" | "rose" =
    days >= 7 ? "emerald" : days >= 3 ? "amber" : "rose";

  const containerTone = {
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    rose: "bg-rose-50 border-rose-200",
  }[tone];

  const badgeTone = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[tone];

  const accentText = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone];

  const totalMs = sub.total_days * 86_400_000;
  const pct = Math.max(0, Math.min(100, (diff / totalMs) * 100));

  return (
    <div className={cn("rounded-2xl border shadow-sm p-5", containerTone)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white", badgeTone)}>
            <CheckCircle2 size={12} /> Active
          </span>
          <span className="text-fluid-sm font-medium text-gray-700">{sub.plan}</span>
        </div>
        <div className={cn("flex items-center gap-1 text-xs font-medium", accentText)}>
          <Clock size={14} /> Time left
        </div>
      </div>

      <CountdownTimer target={expiry} tone={tone} />

      <div className="mt-5 space-y-2">
        <Progress value={pct} className="h-2" />
        <div className="flex justify-between text-xs text-gray-600">
          <span>Renews on {formatDate(sub.expiry_date)}</span>
          <span>{Math.round(pct)}% remaining</span>
        </div>
      </div>
    </div>
  );
}