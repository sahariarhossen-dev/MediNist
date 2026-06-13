import { Sparkles } from "lucide-react";

interface Props {
  show: boolean;
  label?: string;
}

const AIProgressPill = ({ show, label = "MediNist AI is optimizing your note..." }: Props) => {
  if (!show) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 animate-ai-pill-in"
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
      role="status"
      aria-live="polite"
    >
      <div
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600"
        style={{ boxShadow: "0 0 24px rgba(99,102,241,0.55)" }}
      >
        <Sparkles size={14} className="animate-spin" style={{ animationDuration: "2.4s" }} />
        <span>✨ {label}</span>
      </div>
    </div>
  );
};

export default AIProgressPill;