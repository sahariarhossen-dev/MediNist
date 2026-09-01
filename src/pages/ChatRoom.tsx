import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Users, Search, User, BellOff, Bell, Eraser, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MessageItem from "@/components/messaging/MessageItem";
import ChatInput from "@/components/messaging/ChatInput";
import { useChatRoom } from "@/hooks/useChatRoom";
import { useAuth } from "@/contexts/AuthContext";
import { relativeTime } from "@/lib/relativeTime";
import ProfileSheet from "@/components/messaging/ProfileSheet";
import GroupInfoSheet from "@/components/messaging/GroupInfoSheet";
import ChatTopBar from "@/components/chat/ChatTopBar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useThreadPrefs } from "@/lib/threadPrefs";
import { inviteRoleLabel } from "@/lib/staffRoles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const { isMuted, toggleMute } = useThreadPrefs();
  const muted = roomId ? isMuted(roomId) : false;

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

  const isGroup = room?.type === "group";
  const headerName = isGroup ? room?.name || "Group" : other?.full_name || "Pharmacy staff";
  const headerAvatar = isGroup ? room?.avatar_url : other?.avatar_url;
  const isOnline = !!other?.last_seen && Date.now() - new Date(other.last_seen).getTime() < 60_000;

  const presenceText = (() => {
    if (typingUserIds.length > 0) return "typing…";
    if (isGroup) return `${members.length} member${members.length === 1 ? "" : "s"}`;
    if (!other?.last_seen) return "Offline";
    return isOnline ? "Active now" : `Last seen ${relativeTime(other.last_seen)}`;
  })();

  const openHeader = () => {
    if (isGroup) setGroupOpen(true);
    else if (other) setProfileOpen(true);
  };

  const clearChat = async () => {
    if (!roomId) return;
    const { error } = await supabase.from("chat_messages").delete().eq("room_id", roomId);
    if (error) {
      toast.error("Could not clear this chat.");
      return;
    }
    toast.success("Chat cleared.");
    reload();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchOpen || !q) return messages;
    return messages.filter((m) => (m.content ?? "").toLowerCase().includes(q));
  }, [messages, query, searchOpen]);

  return (
    <div className="flex flex-col h-screen bg-[#efeae2]">
      <ChatTopBar
        onBack={() => navigate("/workspace")}
        onIdentityClick={openHeader}
        avatar={
          <span className="relative shrink-0">
            <Avatar className="h-9 w-9">
              {headerAvatar ? <AvatarImage src={headerAvatar} className="object-cover" /> : null}
              <AvatarFallback
                className={
                  isGroup
                    ? "bg-gradient-to-br from-teal-500 to-emerald-500 text-white"
                    : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-semibold"
                }
              >
                {isGroup ? <Users className="h-4 w-4" /> : initials(headerName)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && (
              <span
                aria-hidden
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                  isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                }`}
              />
            )}
          </span>
        }
        title={headerName}
        subtitle={
          <>
            {!isGroup && (
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700">
                {inviteRoleLabel(other?.role)}
              </span>
            )}
            <span className="truncate">{presenceText}</span>
          </>
        }
        menu={
          <>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4 text-emerald-600" />
              Search in Chat
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 rounded-xl py-2.5" onSelect={openHeader}>
              <User className="h-4 w-4 text-emerald-600" />
              {isGroup ? "View Group Info" : "View Staff Profile"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => roomId && toggleMute(roomId)}
            >
              {muted ? (
                <Bell className="h-4 w-4 text-emerald-600" />
              ) : (
                <BellOff className="h-4 w-4 text-emerald-600" />
              )}
              {muted ? "Unmute Notifications" : "Mute Notifications"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => setClearOpen(true)}
            >
              <Eraser className="h-4 w-4 text-muted-foreground" />
              Clear Chat
            </DropdownMenuItem>
          </>
        }
        below={
          searchOpen ? (
            <div className="flex items-center gap-2 px-3 pb-2">
              <div className="flex flex-1 items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500/30">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search in this chat"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="button"
                aria-label="Close search"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery("");
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 transition hover:bg-emerald-500/10 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : null
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-1.5">
        {loading && <p className="text-center text-xs text-gray-500">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-gray-500 mt-10">Say hi 👋</p>
        )}
        {!loading && messages.length > 0 && visible.length === 0 && (
          <p className="text-center text-xs text-gray-500 mt-10">No messages match “{query}”.</p>
        )}
        {visible.map((m, i) => {
          const isMine = m.sender_id === user?.id;
          const prev = visible[i - 1];
          const showSenderName = isGroup && !isMine && (!prev || prev.sender_id !== m.sender_id);
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

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages you are allowed to remove will be deleted for everyone in this chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={clearChat}>
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatRoom;
