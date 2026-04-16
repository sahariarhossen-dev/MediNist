import { Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export type ChatRole = "user" | "assistant";

export interface ChatMessageProps {
  role: ChatRole;
  content: string;
}

const ChatMessage = ({ role, content }: ChatMessageProps) => {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
            : "rounded-bl-md bg-gray-100 text-gray-900"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-pre:my-2">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
          <User className="h-4 w-4 text-gray-600" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
