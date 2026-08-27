import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import LogoMark from "@/components/brand/LogoMark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AgentCardView from "@/components/ai/cards/AgentCardView";
import AgentActionBar from "@/components/ai/AgentActionBar";
import { parseAgentMessage, type AgentAction } from "@/lib/agentCards";

export type ChatRole = "user" | "assistant";

export interface ChatMessageProps {
  role: ChatRole;
  content: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  /** Inline actions rendered under an assistant reply. */
  actions?: AgentAction[];
  onAction?: (action: AgentAction, content: string) => void;
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

const ChatMessage = ({
  role,
  content,
  userName,
  userAvatarUrl,
  actions,
  onAction,
}: ChatMessageProps) => {
  const isUser = role === "user";
  const parsed = isUser ? null : parseAgentMessage(content);
  const cards = parsed ? [...(parsed.block?.cards ?? []), ...parsed.jsonCards] : [];
  const inlineActions = parsed?.block?.actions?.length ? parsed.block.actions : actions ?? [];
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
          <div className="max-w-[80%] rounded-3xl rounded-tr-md bg-chat-user-bubble px-4 py-2.5 text-[15px] leading-relaxed text-[#1f1f1f] ring-1 ring-black/5">
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
          <Avatar className="mt-0.5 h-7 w-7 shrink-0 ring-1 ring-black/10">
            {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={userName ?? "You"} />}
            <AvatarFallback className="bg-slate-100 text-[10px] font-semibold text-slate-700">
              {initials(userName)}
            </AvatarFallback>
          </Avatar>
        </>
      ) : (
        <div className="min-w-0 flex-1 space-y-3 pt-0.5">
          {parsed?.prose && (
            <div className="space-y-3 prose prose-sm max-w-none text-[15.5px] leading-7 text-[#1f1f1f] prose-p:my-0 prose-p:mb-3 prose-strong:font-semibold prose-strong:text-black prose-headings:font-semibold prose-headings:text-black prose-headings:mt-4 prose-headings:mb-2 prose-h1:text-lg prose-h2:text-base prose-h3:text-[15px] prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-1.5 prose-li:leading-7 marker:text-slate-400 prose-code:rounded-md prose-code:bg-black/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:my-3 prose-pre:rounded-xl prose-pre:bg-[#1f1f1f] prose-pre:p-3 prose-pre:text-slate-100 prose-a:text-sky-700 prose-a:underline-offset-2">
              <ReactMarkdown>{parsed.prose}</ReactMarkdown>
            </div>
          )}
          {cards.map((c, i) => (
            <AgentCardView key={i} card={c} />
          ))}
          {onAction && (
            <AgentActionBar
              actions={inlineActions}
              onAction={(a) => onAction(a, parsed?.prose ?? content)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
