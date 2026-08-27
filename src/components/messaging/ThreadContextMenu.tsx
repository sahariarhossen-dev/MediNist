import { BellOff, Bell, Pin, PinOff, CheckCheck } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  pinned: boolean;
  muted: boolean;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onMarkRead: () => void;
}

const ThreadContextMenu = ({
  open,
  onOpenChange,
  title,
  pinned,
  muted,
  onTogglePin,
  onToggleMute,
  onMarkRead,
}: Props) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="mx-auto max-w-md rounded-t-2xl border-0 bg-white/95 p-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
    >
      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" />
      <p className="px-4 pb-1 text-xs font-medium text-slate-400">{title}</p>
      <button
        type="button"
        onClick={onTogglePin}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
      >
        {pinned ? (
          <PinOff className="h-5 w-5 text-slate-600" />
        ) : (
          <Pin className="h-5 w-5 text-slate-600" />
        )}
        <span className="text-sm text-slate-800">{pinned ? "Unpin thread" : "Pin thread"}</span>
      </button>
      <button
        type="button"
        onClick={onToggleMute}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
      >
        {muted ? (
          <Bell className="h-5 w-5 text-slate-600" />
        ) : (
          <BellOff className="h-5 w-5 text-slate-600" />
        )}
        <span className="text-sm text-slate-800">{muted ? "Unmute" : "Mute notifications"}</span>
      </button>
      <button
        type="button"
        onClick={onMarkRead}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-emerald-50 active:bg-emerald-100"
      >
        <CheckCheck className="h-5 w-5 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-700">Mark as read</span>
      </button>
    </SheetContent>
  </Sheet>
);

export default ThreadContextMenu;
