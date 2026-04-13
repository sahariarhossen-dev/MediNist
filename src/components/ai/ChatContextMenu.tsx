import { Pin, Copy, CheckSquare, Share2, Trash2, Info } from "lucide-react";

interface Props {
  x: number;
  y: number;
  onAction: (action: string) => void;
  onClose: () => void;
}

const actions = [
  { key: "pin", label: "Pin", icon: Pin },
  { key: "copy", label: "Copy", icon: Copy },
  { key: "select", label: "Select", icon: CheckSquare },
  { key: "share", label: "Share", icon: Share2 },
  { key: "delete", label: "Delete", icon: Trash2 },
  { key: "detail", label: "Detail", icon: Info },
];

const ChatContextMenu = ({ x, y, onAction, onClose }: Props) => {
  // Clamp position so menu stays on screen
  const menuW = 200;
  const menuH = 180;
  const clampedX = Math.min(x, window.innerWidth - menuW - 12);
  const clampedY = Math.min(y, window.innerHeight - menuH - 12);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-[61] bg-[#1E293B] rounded-2xl p-3 shadow-2xl border border-[#334155]
          animate-scale-in origin-top-left"
        style={{ left: clampedX, top: clampedY, width: menuW }}
      >
        <div className="grid grid-cols-3 gap-1">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => onAction(a.key)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 hover:bg-[#334155] transition-colors"
            >
              <a.icon className={`w-5 h-5 ${a.key === "delete" ? "text-red-400" : "text-[#94A3B8]"}`} />
              <span className={`text-[10px] font-medium ${a.key === "delete" ? "text-red-400" : "text-[#CBD5E1]"}`}>
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default ChatContextMenu;
