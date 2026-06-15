import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import LogoMark from "@/components/brand/LogoMark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type ChatRole = "user" | "assistant";

export interface ChatMessageProps {
  role: ChatRole;
  content: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
}

const initials = (name?: string | null) => {
  if (!name) return "U";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

const ChatMessage = ({ role, content, userName, userAvatarUrl }: ChatMessageProps) => {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex w-full items-start gap-3 animate-fade-in-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && <LogoMark size={28} className="mt-0.5 h-7 w-7" />}
      {isUser ? (
        <>
          <div className="max-w-[80%] rounded-3xl rounded-tr-md bg-slate-100 px-4 py-2.5 text-[15px] leading-relaxed text-slate-900">
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
          <Avatar className="mt-0.5 h-7 w-7 shrink-0 ring-1 ring-slate-200">
            {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={userName ?? "You"} />}
            <AvatarFallback className="bg-slate-100 text-[10px] font-semibold text-slate-700">
              {initials(userName)}
            </AvatarFallback>
          </Avatar>
        </>
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
