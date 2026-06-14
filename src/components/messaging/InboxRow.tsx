import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/relativeTime";
import { Users } from "lucide-react";
import type { InboxRoom } from "@/hooks/useChatInbox";

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
}: {
  room: InboxRoom;
  onClick: () => void;
  presence?: Presence;
}) => {
  const unread = room.unread_count > 0;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3.5 px-4 hover:bg-slate-50/60 active:bg-slate-100/80 transition-colors cursor-pointer text-left"
    >
      <div className="relative shrink-0">
        <Avatar className="h-12 w-12">
          {room.avatar_url ? <AvatarImage src={room.avatar_url} alt={room.display_name} /> : null}
          <AvatarFallback
            className={
              room.type === "group"
                ? "bg-gradient-to-br from-emerald-400 to-green-600 text-white"
                : "bg-blue-500 text-white text-sm font-semibold"
            }
          >
            {room.type === "group" ? <Users className="h-5 w-5" /> : initials(room.display_name)}
          </AvatarFallback>
        </Avatar>
        {presence === "online" && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white">
            <span className="absolute inset-0 rounded-full bg-emerald-500/60 animate-ping" />
          </span>
        )}
        {presence === "away" && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`truncate text-[15px] tracking-tight text-slate-900 ${
            unread ? "font-semibold" : "font-medium"
          }`}
        >
          {room.display_name}
        </p>
        <p
          className={`mt-0.5 line-clamp-1 text-xs ${
            unread ? "text-slate-900 font-medium" : "text-slate-400 font-normal"
          }`}
        >
          {room.last_message || "No messages yet"}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {room.last_message_at && (
          <span
            className={`text-[11px] ${
              unread ? "text-emerald-600 font-semibold" : "text-slate-400"
            }`}
          >
            {relativeTime(room.last_message_at)}
          </span>
        )}
        {unread && (
          <span className="bg-emerald-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center">
            {room.unread_count > 99 ? "99+" : room.unread_count}
          </span>
        )}
      </div>
    </button>
  );
};

export default InboxRow;