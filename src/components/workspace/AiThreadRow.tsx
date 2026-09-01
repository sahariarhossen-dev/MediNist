import { useRef, useState } from "react";
import { BellOff, Pin, PinOff, Bell, Pencil, Archive, Sparkles } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { relativeTime } from "@/lib/relativeTime";
import { getTopic } from "@/lib/aiTopics";
import type { AiThread } from "@/hooks/useAiThreads";

interface Props {
  thread: AiThread;
  unread?: boolean;
  thinking?: boolean;
  pinned?: boolean;
  muted?: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onRename: () => void;
  onArchive: () => void;
}

const AiThreadRow = ({
  thread,
  unread,
  thinking,
  pinned,
  muted,
  onClick,
  onTogglePin,
  onToggleMute,
  onRename,
  onArchive,
}: Props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const topic = getTopic(thread.topic_key);
  const Icon = topic.icon;

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const close = (fn: () => void) => () => {
    fn();
    setMenuOpen(false);
  };

  return (
    <>
      <button
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY };
          longPressed.current = false;
          clear();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            setMenuOpen(true);
          }, 450);
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const t = e.touches[0];
          if (
            Math.abs(t.clientX - start.current.x) > 10 ||
            Math.abs(t.clientY - start.current.y) > 10
          )
            clear();
        }}
        onTouchEnd={clear}
        onTouchCancel={clear}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onClick();
        }}
        className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-slate-50/70 active:bg-slate-100/70"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.6)] ring-1 ring-emerald-300/50">
          <Icon className="h-[18px] w-[18px]" />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-600 ring-1 ring-emerald-100">
            <Sparkles className="h-3 w-3" />
          </span>
          {thinking && (
            <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-emerald-400/60" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={`truncate text-[15px] tracking-tight ${
                unread && !muted ? "font-semibold text-slate-900" : "font-medium text-slate-800"
              }`}
            >
              {thread.title}
            </p>
            {pinned && <Pin className="h-3 w-3 shrink-0 text-slate-400" />}
            {muted && <BellOff className="h-3 w-3 shrink-0 text-slate-400" />}
          </div>
          {thinking ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-indigo-600">
              Thinking
              <span className="flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.3s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.15s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-500" />
              </span>
            </p>
          ) : (
            <p
              className={`mt-0.5 line-clamp-1 text-xs ${
                unread && !muted ? "font-medium text-slate-900" : "text-slate-400"
              }`}
            >
              {thread.last_message || topic.label}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] text-slate-400">
            {relativeTime(thread.last_message_at ?? thread.updated_at)}
          </span>
          {unread && !thinking && (
            <span
              className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                muted ? "bg-slate-300" : "bg-indigo-500"
              }`}
            >
              1
            </span>
          )}
        </div>
      </button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-md rounded-t-2xl border-0 bg-white/95 p-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
        >
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" />
          <p className="px-4 pb-1 text-xs font-medium text-slate-400">{thread.title}</p>
          <button
            type="button"
            onClick={close(onTogglePin)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50"
          >
            {pinned ? (
              <PinOff className="h-5 w-5 text-slate-600" />
            ) : (
              <Pin className="h-5 w-5 text-slate-600" />
            )}
            <span className="text-sm text-slate-800">{pinned ? "Unpin topic" : "Pin topic"}</span>
          </button>
          <button
            type="button"
            onClick={close(onToggleMute)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50"
          >
            {muted ? (
              <Bell className="h-5 w-5 text-slate-600" />
            ) : (
              <BellOff className="h-5 w-5 text-slate-600" />
            )}
            <span className="text-sm text-slate-800">{muted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            type="button"
            onClick={close(onRename)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <Pencil className="h-5 w-5 text-slate-600" />
            <span className="text-sm text-slate-800">Rename topic</span>
          </button>
          <button
            type="button"
            onClick={close(onArchive)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-rose-50"
          >
            <Archive className="h-5 w-5 text-rose-600" />
            <span className="text-sm font-medium text-rose-700">Archive topic</span>
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AiThreadRow;
