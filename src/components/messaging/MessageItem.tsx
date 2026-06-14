import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CheckCheck, Copy, FilePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { colorForUserId } from "@/lib/chatColors";
import type { ChatMessage, RoomMember } from "@/hooks/useChatRoom";
import { parseCardPayload } from "@/lib/chatCards";
import ChatMedicineCard from "./cards/ChatMedicineCard";
import ChatInvoiceCard from "./cards/ChatInvoiceCard";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCreateNote } from "@/hooks/useNotes";
import { messagePlainText, parseMessageToBlocks } from "@/lib/messageToNote";

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

interface Props {
  message: ChatMessage;
  isMine: boolean;
  showSenderName: boolean;
  senderName: string | null;
  members: RoomMember[];
  myId: string;
}

const MessageItem = ({ message, isMine, showSenderName, senderName, members, myId }: Props) => {
  // Read by all others?
  const others = members.filter((m) => m.user_id !== myId);
  const readByAll =
    isMine &&
    others.length > 0 &&
    others.every((m) => new Date(m.last_read_at).getTime() >= new Date(message.created_at).getTime());

  const isImage = message.attachment_type?.startsWith("image/");
  const card = parseCardPayload(message.content);

  const navigate = useNavigate();
  const createNote = useCreateNote();
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const plainText = messagePlainText(message.content);
  const canConvert = plainText.trim().length > 0;

  const clearTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    pressStart.current = { x: t.clientX, y: t.clientY };
    clearTimer();
    pressTimer.current = setTimeout(() => setMenuOpen(true), 450);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!pressStart.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - pressStart.current.x);
    const dy = Math.abs(t.clientY - pressStart.current.y);
    if (dx > 10 || dy > 10) clearTimer();
  };
  const onTouchEnd = () => clearTimer();
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText || "");
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
    setMenuOpen(false);
  };

  const handleConvert = async () => {
    if (!canConvert) return;
    try {
      const note = await createNote.mutateAsync({
        title: `Task from Chat: ${senderName || "Member"}`,
        content: parseMessageToBlocks(plainText),
      });
      setMenuOpen(false);
      toast.success("📝 Message saved as an actionable task in Notepad!", {
        action: {
          label: "Open Note",
          onClick: () => navigate(`/more/notes/${note.id}`),
        },
        duration: 5000,
      });
    } catch {
      toast.error("Could not save to Notepad");
    }
  };

  const contextHandlers = {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  };

  const ContextMenu = (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-2 max-w-md mx-auto border-0 backdrop-blur-sm bg-white/95 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" />
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition text-left"
        >
          <Copy className="h-5 w-5 text-slate-600" />
          <span className="text-sm text-slate-800">Copy Text</span>
        </button>
        <button
          type="button"
          onClick={handleConvert}
          disabled={!canConvert || createNote.isPending}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 active:bg-indigo-100 transition text-left disabled:opacity-50"
        >
          <FilePlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            ✨ Convert to MediNist Note
          </span>
        </button>
      </SheetContent>
    </Sheet>
  );

  if (card) {
    return (
      <div className={cn("flex w-full px-3", isMine ? "justify-end" : "justify-start")}>
        <div className="flex flex-col max-w-[85%]" {...contextHandlers}>
          {showSenderName && !isMine && (
            <p className={cn("text-xs font-semibold mb-1 px-1", colorForUserId(message.sender_id))}>
              {senderName || "Member"}
            </p>
          )}
          {card.kind === "medicine" ? (
            <ChatMedicineCard data={card.data} />
          ) : (
            <ChatInvoiceCard data={card.data} />
          )}
          <div className="flex items-center justify-end gap-1 mt-1 px-1">
            <span className="text-[10px] text-gray-500">{fmtTime(message.created_at)}</span>
            {isMine &&
              (readByAll ? (
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
              ) : (
                <Check className="h-3.5 w-3.5 text-gray-500" />
              ))}
          </div>
        </div>
        {ContextMenu}
      </div>
    );
  }

  return (
    <div className={cn("flex w-full px-3", isMine ? "justify-end" : "justify-start")}>
      <div
        {...contextHandlers}
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 shadow-sm relative",
          isMine ? "bg-[#dcf8c6] rounded-br-md" : "bg-white rounded-bl-md border border-gray-100"
        )}
      >
        {showSenderName && !isMine && (
          <p className={cn("text-xs font-semibold mb-0.5", colorForUserId(message.sender_id))}>
            {senderName || "Member"}
          </p>
        )}
        {message.attachment_url && isImage && (
          <a href={message.attachment_url} target="_blank" rel="noreferrer">
            <img src={message.attachment_url} alt="attachment" className="rounded-lg max-h-60 mb-1" />
          </a>
        )}
        {message.attachment_url && !isImage && (
          <a
            href={message.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-blue-700 underline mb-1"
          >
            📎 Attachment
          </a>
        )}
        {message.content && (
          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-snug">
            {message.content}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-gray-500">{fmtTime(message.created_at)}</span>
          {isMine && (
            readByAll ? (
              <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
            ) : (
              <Check className="h-3.5 w-3.5 text-gray-500" />
            )
          )}
        </div>
      </div>
      {ContextMenu}
    </div>
  );
};

export default MessageItem;