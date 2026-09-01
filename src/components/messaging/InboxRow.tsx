import { useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/relativeTime";
import { BellOff, Pin, Users } from "lucide-react";
import type { InboxRoom } from "@/hooks/useChatInbox";
import ThreadContextMenu from "./ThreadContextMenu";

const initials = (name: string | null | undefined) =>
  (name || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

type Presence = "online" | "away" | null;

const InboxRow = ({
  room,
  onClick,
  presence = null,
  pinned = false,
  muted = false,
  fallbackName = null,
  onTogglePin,
  onToggleMute,
  onMarkRead,
}: {
  room: InboxRoom;
  onClick: () => void;
  presence?: Presence;
  pinned?: boolean;
  muted?: boolean;
  /** Shown instead of the generic placeholder when the teammate has no name. */
  fallbackName?: string | null;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onMarkRead?: () => void;
}) => {
  const unread = room.unread_count > 0;
  const title =
    !room.display_name || room.display_name === "Teammate"
      ? fallbackName || "Pharmacy staff"
      : room.display_name;
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const hasMenu = !!(onTogglePin || onToggleMute || onMarkRead);

  const clearTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const contextHandlers = hasMenu
    ? {
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          setMenuOpen(true);
        },
        onTouchStart: (e: React.TouchEvent) => {
          const t = e.touches[0];
          pressStart.current = { x: t.clientX, y: t.clientY };
          longPressed.current = false;
          clearTimer();
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setMenuOpen(true);
          }, 450);
        },
        onTouchMove: (e: React.TouchEvent) => {
          if (!pressStart.current) return;
          const t = e.touches[0];
          if (
            Math.abs(t.clientX - pressStart.current.x) > 10 ||
            Math.abs(t.clientY - pressStart.current.y) > 10
          )
            clearTimer();
        },
        onTouchEnd: clearTimer,
        onTouchCancel: clearTimer,
      }
    : {};

  return (
    <>
      <button
        {...contextHandlers}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onClick();
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/60 active:bg-slate-100/80"
      >
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12">
            {room.avatar_url ? <AvatarImage src={room.avatar_url} alt={room.display_name} /> : null}
            <AvatarFallback
              className={
                room.type === "group"
                  ? "bg-gradient-to-br from-emerald-400 to-green-600 text-white"
                  : "bg-blue-500 text-sm font-semibold text-white"
              }
            >
              {room.type === "group" ? <Users className="h-5 w-5" /> : initials(room.display_name)}
            </AvatarFallback>
          </Avatar>
          {presence === "online" && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
            </span>
          )}
          {presence === "away" && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={`truncate text-[15px] tracking-tight text-slate-900 ${
                unread && !muted ? "font-semibold" : "font-medium"
              }`}
            >
              {room.display_name}
            </p>
            {pinned && <Pin className="h-3 w-3 shrink-0 text-slate-400" />}
            {muted && <BellOff className="h-3 w-3 shrink-0 text-slate-400" />}
          </div>
          <p
            className={`mt-0.5 line-clamp-1 text-xs ${
              unread && !muted ? "font-medium text-slate-900" : "font-normal text-slate-400"
            }`}
          >
            {room.last_message || "No messages yet"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {room.last_message_at && (
            <span
              className={`text-[11px] ${
                unread && !muted ? "font-semibold text-emerald-600" : "text-slate-400"
              }`}
            >
              {relativeTime(room.last_message_at)}
            </span>
          )}
          {unread && (
            <span
              className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                muted ? "bg-slate-300" : "bg-emerald-500"
              }`}
            >
              {room.unread_count > 99 ? "99+" : room.unread_count}
            </span>
          )}
        </div>
      </button>

      {hasMenu && (
        <ThreadContextMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          title={room.display_name}
          pinned={pinned}
          muted={muted}
          onTogglePin={() => {
            onTogglePin?.();
            setMenuOpen(false);
          }}
          onToggleMute={() => {
            onToggleMute?.();
            setMenuOpen(false);
          }}
          onMarkRead={() => {
            onMarkRead?.();
            setMenuOpen(false);
          }}
        />
      )}
    </>
  );
};

export default InboxRow;
