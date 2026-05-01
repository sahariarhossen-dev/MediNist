import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorForUserId } from "@/lib/chatColors";
import type { ChatMessage, RoomMember } from "@/hooks/useChatRoom";

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

  return (
    <div className={cn("flex w-full px-3", isMine ? "justify-end" : "justify-start")}>
      <div
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
    </div>
  );
};

export default MessageItem;