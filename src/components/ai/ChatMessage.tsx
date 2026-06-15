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
        "flex w-full gap-3 animate-fade-in-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          <LogoMark size={24} />
        </div>
      )}
      {isUser ? (
        <div className="max-w-[80%] rounded-3xl rounded-tr-md bg-slate-100 px-4 py-2.5 text-[15px] leading-relaxed text-slate-900">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      ) : (
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="prose prose-sm max-w-none text-[15px] leading-7 text-slate-800 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-2.5 prose-headings:font-semibold prose-strong:text-slate-900 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:my-2 prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:p-3 prose-pre:text-slate-100">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
