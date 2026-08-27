import { PackageSearch, ShoppingCart, UserPlus, Share2 } from "lucide-react";
import type { AgentAction, AgentActionId } from "@/lib/agentCards";

const ICONS: Record<AgentActionId, typeof PackageSearch> = {
  check_stock: PackageSearch,
  reorder: ShoppingCart,
  assign_task: UserPlus,
  forward_to_staff: Share2,
};

const AgentActionBar = ({
  actions,
  onAction,
}: {
  actions: AgentAction[];
  onAction: (action: AgentAction) => void;
}) => {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {actions.map((a) => {
        const Icon = ICONS[a.id] ?? Share2;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction(a)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
          >
            <Icon className="h-3.5 w-3.5 text-slate-500" />
            {a.label}
          </button>
        );
      })}
    </div>
  );
};

export default AgentActionBar;
