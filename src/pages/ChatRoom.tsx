import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MessageItem from "@/components/messaging/MessageItem";
import ChatInput from "@/components/messaging/ChatInput";
import { useChatRoom } from "@/hooks/useChatRoom";
import { useAuth } from "@/contexts/AuthContext";
import { relativeTime } from "@/lib/relativeTime";
import ProfileSheet from "@/components/messaging/ProfileSheet";
import GroupInfoSheet from "@/components/messaging/GroupInfoSheet";

const initials = (n: string | null | undefined) =>
  (n || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const ChatRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { room, members, messages, typingUserIds, sendMessage, markRead, broadcastTyping, loading, reload } =
    useChatRoom(roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  useEffect(() => {
    markRead();
  }, [markRead, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const other = useMemo(
    () => members.find((m) => m.user_id !== user?.id),
    [members, user?.id]
  );

  const headerName =
    room?.type === "group"
      ? room?.name || "Group"
      : other?.full_name || (members.length > 0 ? "Teammate" : "");
  const headerAvatar = room?.type === "group" ? room?.avatar_url : other?.avatar_url;

  const subtitle = (() => {
    if (typingUserIds.length > 0) return "typing…";
    if (room?.type === "group") return `${members.length} member${members.length === 1 ? "" : "s"}`;
    if (!other) return "";
    if (!other.last_seen) return "Offline";
    const isOnline = Date.now() - new Date(other.last_seen).getTime() < 60_000;
    return isOnline ? "Online" : `Last seen ${relativeTime(other.last_seen)}`;
  })();

  const openHeader = () => {
    if (room?.type === "group") setGroupOpen(true);
    else if (other) setProfileOpen(true);
  };

  return (
    <div className="flex flex-col h-screen bg-[#efeae2]">
      <header className="flex items-center gap-3 bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <button
          onClick={openHeader}
          className="flex items-center gap-3 flex-1 min-w-0 -mx-1 px-1 py-1 rounded-md hover:bg-gray-50 text-left"
        >
          <Avatar className="h-10 w-10 shrink-0">
            {headerAvatar ? <AvatarImage src={headerAvatar} className="object-cover" /> : null}
            <AvatarFallback
              className={
                room?.type === "group"
                  ? "bg-gradient-to-br from-emerald-400 to-green-600 text-white"
                  : "bg-blue-500 text-white text-xs font-semibold"
              }
            >
              {room?.type === "group" ? <Users className="h-4 w-4" /> : initials(headerName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate font-semibold text-sm text-gray-900 leading-tight">{headerName}</p>
            <p className="truncate text-[11px] text-gray-500 leading-tight mt-0.5">{subtitle}</p>
          </div>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-1.5">
        {loading && <p className="text-center text-xs text-gray-500">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-gray-500 mt-10">Say hi 👋</p>
        )}
        {messages.map((m, i) => {
          const isMine = m.sender_id === user?.id;
          const prev = messages[i - 1];
          const showSenderName =
            room?.type === "group" && !isMine && (!prev || prev.sender_id !== m.sender_id);
          const sender = members.find((x) => x.user_id === m.sender_id);
          return (
            <MessageItem
              key={m.id}
              message={m}
              isMine={isMine}
              showSenderName={showSenderName}
              senderName={sender?.full_name ?? null}
              members={members}
              myId={user?.id || ""}
            />
          );
        })}
      </div>

      <ChatInput onSend={sendMessage} onTyping={broadcastTyping} roomId={roomId || ""} />

      <ProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        member={
          other
            ? {
                user_id: other.user_id,
                full_name: other.full_name,
                avatar_url: other.avatar_url,
                role: other.role,
                phone: other.phone,
                last_seen: other.last_seen,
                verified: true,
              }
            : null
        }
      />
      <GroupInfoSheet
        open={groupOpen}
        onOpenChange={setGroupOpen}
        room={room}
        members={members}
        onChanged={reload}
      />
    </div>
  );
};

export default ChatRoom;