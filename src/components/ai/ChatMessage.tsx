import { CircleUserRound } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import LogoMark from "@/components/brand/LogoMark";

export type ChatRole = "user" | "assistant";

export interface ChatMessageProps {
  role: ChatRole;
  content: string;
}

const ChatMessage = ({ role, content }: ChatMessageProps) => {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex w-full gap-2.5 animate-fade-in-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-white shadow-sm">
          <LogoMark size={22} />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm",
          isUser
            ? "rounded-2xl rounded-tr-none bg-gradient-to-br from-indigo-600 to-blue-600 text-white"
            : "rounded-2xl rounded-tl-none border border-slate-100 bg-white text-slate-800"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-headings:font-semibold prose-strong:text-slate-900 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:my-2 prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:p-3 prose-pre:text-slate-100">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 ring-1 ring-indigo-100">
          <CircleUserRound className="h-5 w-5 text-indigo-600" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
