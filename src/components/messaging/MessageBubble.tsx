import { MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useChatInbox } from "@/hooks/useChatInbox";

const MessageBubble = () => {
  const navigate = useNavigate();
  const { totalUnread } = useChatInbox();

  return (
    <button
      aria-label="Messages"
      onClick={() => navigate("/messages")}
      className="relative p-2 rounded-full hover:bg-gray-100 transition"
    >
      <MessageSquare size={22} className="text-gray-600" />
      {totalUnread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-[#e9f1fb]">
          {totalUnread > 9 ? "9+" : totalUnread}
        </span>
      )}
    </button>
  );
};

export default MessageBubble;