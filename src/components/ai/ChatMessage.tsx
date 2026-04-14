import { Bot } from "lucide-react";

interface ChatMessageProps {
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

const ChatMessage = ({ content, role, timestamp }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`flex gap-2 max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
            <Bot size={16} className="text-primary" />
          </div>
        )}
        <div>
          <div
            className={`px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                : "bg-muted text-foreground rounded-2xl rounded-bl-md"
            }`}
          >
            {content}
          </div>
          <p className={`text-[10px] text-muted-foreground mt-1 ${isUser ? "text-right" : "text-left"}`}>
            {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
