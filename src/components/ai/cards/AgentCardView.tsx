import { BarChart3, ListChecks } from "lucide-react";
import type { AgentCard } from "@/lib/agentCards";

const AgentCardView = ({ card }: { card: AgentCard }) => {
  if (card.kind === "summary") {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-900">{card.title}</p>
            {card.subtitle && (
              <p className="truncate text-[11px] text-slate-500">{card.subtitle}</p>
            )}
          </div>
        </div>
        <dl className="divide-y divide-slate-100">
          {card.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2">
              <dt className="text-[12.5px] text-slate-500">{r.label}</dt>
              <dd className="text-[13px] font-semibold tabular-nums text-slate-900">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-emerald-600" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900">{card.title}</p>
          {card.subtitle && <p className="truncate text-[11px] text-slate-500">{card.subtitle}</p>}
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {card.items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-900">{it.name}</p>
              {it.meta && <p className="truncate text-[11px] text-slate-500">{it.meta}</p>}
            </div>
            {it.value && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-slate-700">
                {it.value}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AgentCardView;
