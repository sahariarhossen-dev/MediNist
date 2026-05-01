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

const InboxRow = ({ room, onClick }: { room: InboxRoom; onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left"
    >
      <Avatar className="h-12 w-12 shrink-0">
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
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-semibold text-gray-900 text-sm">{room.display_name}</p>
          {room.last_message_at && (
            <span className={`text-[11px] shrink-0 ${room.unread_count > 0 ? "text-green-600 font-semibold" : "text-gray-400"}`}>
              {relativeTime(room.last_message_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`truncate text-xs ${room.unread_count > 0 ? "text-gray-800 font-medium" : "text-gray-500"}`}>
            {room.last_message || "No messages yet"}
          </p>
          {room.unread_count > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-green-500 text-white text-[11px] font-bold flex items-center justify-center">
              {room.unread_count > 99 ? "99+" : room.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default InboxRow;