import * as React from "react";

export const StatCard = ({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string;
}) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${iconBg}`}>{icon}</div>
    <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    <p className="text-base font-bold text-gray-900 tabular-nums truncate">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
  </div>
);

export const SmallCircularProgress = ({ percent }: { percent: number }) => {
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} stroke="#E5E7EB" strokeWidth="7" fill="none" />
        <circle
          cx="40" cy="40" r={r}
          stroke="hsl(160 84% 39%)"
          strokeWidth="7" fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-900">{Math.round(percent)}%</span>
      </div>
    </div>
  );
};

export const BadgeTile = ({
  icon, label, earned, color,
}: { icon: React.ReactNode; label: string; earned: boolean; color: "amber" | "sky" | "rose" }) => {
  const colors: Record<string, string> = {
    amber: earned ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-300 border-gray-100",
    sky: earned ? "bg-sky-100 text-sky-700 border-sky-200" : "bg-gray-50 text-gray-300 border-gray-100",
    rose: earned ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-gray-50 text-gray-300 border-gray-100",
  };
  return (
    <div className={`rounded-2xl border p-3 flex flex-col items-center text-center gap-1.5 ${colors[color]}`}>
      {icon}
      <p className="text-[10px] font-semibold leading-tight">{label}</p>
    </div>
  );
};

export const fmtBdt = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

export const startOfMonthIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

export const startOfWeekIso = () => {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7; // Monday-start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};