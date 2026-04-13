import { Pill, Check } from "lucide-react";
import type { Conversation } from "./chatStore";

interface Props {
  convo: Conversation;
  selected: boolean;
  selectMode: boolean;
  onClick: () => void;
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
  onToggleSelect: () => void;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const ConversationRow = ({ convo, selected, selectMode, onClick, onLongPress, onToggleSelect }: Props) => {
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let didLongPress = false;

  const startPress = (e: React.TouchEvent | React.MouseEvent) => {
    didLongPress = false;
    pressTimer = setTimeout(() => {
      didLongPress = true;
      onLongPress(e);
    }, 500);
  };

  const endPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    if (!didLongPress) {
      if (selectMode) onToggleSelect();
      else onClick();
    }
  };

  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  return (
    <div
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={cancelPress}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={cancelPress}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer select-none transition-colors duration-150
        ${selected ? "bg-[#1A8CFF]/15 border border-[#1A8CFF]/40" : "hover:bg-[#111827] border border-transparent"}`}
    >
      {/* Select checkbox or pill icon */}
      <div className="mt-0.5 shrink-0">
        {selectMode ? (
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
            ${selected ? "bg-[#1A8CFF] border-[#1A8CFF]" : "border-[#475569]"}`}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-[#1A8CFF]/10 flex items-center justify-center">
            <Pill className="w-4.5 h-4.5 text-[#1A8CFF]" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#F1F5F9] truncate">{convo.title}</h3>
          <span className="text-[10px] text-[#64748B] shrink-0">{formatTime(convo.updatedAt)}</span>
        </div>
        <p className="text-xs text-[#94A3B8] line-clamp-2 mt-0.5 leading-relaxed">{convo.preview || "Start a new conversation..."}</p>
      </div>
    </div>
  );
};

export default ConversationRow;
