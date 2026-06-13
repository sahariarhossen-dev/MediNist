import { Clock, X } from "lucide-react";

interface Props {
  iso: string;
  onClear: () => void;
}

function formatReminder(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date}, ${time}`;
}

const ReminderBadge = ({ iso, onClear }: Props) => {
  return (
    <div className="inline-flex items-center gap-1.5 self-start bg-amber-50 text-amber-800 border border-amber-200 rounded-full pl-2.5 pr-1 py-1 text-xs font-medium mb-2 shadow-sm">
      <Clock size={13} className="text-amber-600" />
      <span>{formatReminder(iso)}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear reminder"
        className="ml-1 p-0.5 rounded-full hover:bg-amber-100"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default ReminderBadge;