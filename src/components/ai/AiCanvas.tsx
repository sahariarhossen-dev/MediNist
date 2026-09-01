import { X } from "lucide-react";
import { getTopic, type CanvasMode } from "@/lib/aiTopics";
import AgentCardView from "@/components/ai/cards/AgentCardView";
import type { AgentCard } from "@/lib/agentCards";
import { cn } from "@/lib/utils";

interface AiCanvasProps {
  /** Topic of the current thread — decides whether a canvas exists at all. */
  topicKey: string | null;
  /** Cards lifted from the newest assistant reply. */
  cards: AgentCard[];
  open: boolean;
  onClose: () => void;
  /** Rendered as a drawer on mobile, split pane on desktop. */
  variant?: "pane" | "sheet";
}

const TITLES: Record<CanvasMode, string> = {
  chart: "Sales canvas",
  medicines: "Medicine canvas",
  staff: "Performance canvas",
  ledger: "Ledger canvas",
  none: "Canvas",
};

/**
 * Topic-driven canvas: a pure projection of the latest agent block for this
 * thread. It issues no queries of its own.
 */
const AiCanvas = ({ topicKey, cards, open, onClose, variant = "pane" }: AiCanvasProps) => {
  const topic = getTopic(topicKey);
  if (topic.canvas === "none" || !open) return null;

  const body =
    cards.length === 0 ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-semibold text-slate-700">Nothing to plot yet</p>
        <p className="max-w-xs text-[12.5px] leading-relaxed text-slate-500">
          Ask a data question in this topic and the canvas fills with the structured result.
        </p>
      </div>
    ) : (
      <div className="space-y-3 p-4">
        {cards.map((c, i) => (
          <AgentCardView key={i} card={c} />
        ))}
      </div>
    );

  return (
    <aside
      className={cn(
        "flex flex-col border-slate-200 bg-white/80 backdrop-blur",
        variant === "pane"
          ? "hidden w-[42%] max-w-md border-l lg:flex"
          : "fixed inset-x-0 bottom-0 z-40 max-h-[70vh] animate-in slide-in-from-bottom rounded-t-3xl border-t shadow-[0_-8px_40px_rgba(0,0,0,0.12)] lg:hidden"
      )}
    >
      {variant === "sheet" && (
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />
      )}
      <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <p className="flex-1 text-[13px] font-semibold tracking-tight text-slate-800">
          {TITLES[topic.canvas]}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close canvas"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
};

export default AiCanvas;
