import { useCountdown } from "@/hooks/useCountdown";
import { cn } from "@/lib/utils";

type Tone = "emerald" | "amber" | "rose";

const toneText: Record<Tone, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
};

const tonePillBg: Record<Tone, string> = {
  emerald: "bg-emerald-100/70",
  amber: "bg-amber-100/70",
  rose: "bg-rose-100/70",
};

function Unit({ value, label, tone }: { value: number; label: string; tone: Tone }) {
  const padded = value.toString().padStart(2, "0");
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl px-2.5 py-2 min-w-[58px]",
        tonePillBg[tone],
      )}
    >
      <span
        key={padded}
        className={cn("text-2xl sm:text-3xl font-bold tabular-nums animate-fade-in", toneText[tone])}
      >
        {padded}
      </span>
      <span className={cn("text-[10px] uppercase tracking-wider mt-0.5", toneText[tone])}>
        {label}
      </span>
    </div>
  );
}

export default function CountdownTimer({ target, tone }: { target: Date; tone: Tone }) {
  const { days, hours, minutes, seconds } = useCountdown(target);
  const sep = cn("text-2xl sm:text-3xl font-bold", toneText[tone]);
  return (
    <div className="flex items-center justify-center gap-1.5">
      <Unit value={days} label="Days" tone={tone} />
      <span className={sep}>:</span>
      <Unit value={hours} label="Hours" tone={tone} />
      <span className={sep}>:</span>
      <Unit value={minutes} label="Min" tone={tone} />
      <span className={sep}>:</span>
      <Unit value={seconds} label="Sec" tone={tone} />
    </div>
  );
}