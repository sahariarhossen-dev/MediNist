import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Bot, Loader2, ArrowLeft, Settings, Plus } from "lucide-react";
import { toast } from "sonner";
import SuggestionChips from "./SuggestionChips";
import ChatSettingsDialog from "./ChatSettingsDialog";
import { buildChatRequestMessages } from "./chatRequestUtils";
import { supabase } from "@/integrations/supabase/client";
import {
  getConversation,
  updateMessages,
  deleteConversation,
  DEFAULT_FIRST_MESSAGE,
  type Msg,
} from "./chatStore";

interface Props {
  conversationId: string;
  onBack: () => void;
}

const parseAssistantStream = async (response: Response, onChunk: (chunk: string) => void) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch {
        // skip malformed chunks
      }
    }
  }
};

const invokeChatPharmacy = async ({
  accessToken,
  messages,
  testConnection = false,
  onChunk,
}: {
  accessToken: string;
  messages: Msg[];
  testConnection?: boolean;
  onChunk: (chunk: string) => void;
}) => {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-pharmacy`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ messages, testConnection }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `Server error ${response.status}`);
  }

  await parseAssistantStream(response, onChunk);
};

const ChatScreen = ({ conversationId, onBack }: Props) => {
  const convo = getConversation(conversationId);
  const [messages, setMessages] = useState<Msg[]>(convo?.messages || [DEFAULT_FIRST_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist on change
  useEffect(() => {
    updateMessages(conversationId, messages);
  }, [messages, conversationId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleDelete = useCallback(() => {
    deleteConversation(conversationId);
    toast.success("Chat deleted");
    onBack();
  }, [conversationId, onBack]);

  const handleTestConnection = useCallback(async () => {
    setIsTestingConnection(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error("Please log in to test the AI assistant.");
        return;
      }

      let assistantReply = "";
      await invokeChatPharmacy({
        accessToken: session.access_token,
        messages: [],
        testConnection: true,
        onChunk: (chunk) => {
          assistantReply += chunk;
        },
      });

      if (!assistantReply.trim() || assistantReply.trim().startsWith("⚠️")) {
        throw new Error(assistantReply.trim() || "Connection test failed");
      }

      toast.success("Gemini connection is ready.");
      setIsSettingsOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Connection test failed");
    } finally {
      setIsTestingConnection(false);
    }
  }, []);

  const doSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please log in to use the AI assistant.");
        setIsLoading(false);
        return;
      }

      const chatMessages = buildChatRequestMessages(updatedMessages);
      await invokeChatPharmacy({
        accessToken: session.access_token,
        messages: chatMessages,
        onChunk: upsert,
      });

      if (!assistantSoFar) {
        upsert("I'm sorry, I couldn't generate a response. Please try again.");
      }
    } catch (e: any) {
      const message = e?.message || "Failed to get response";
      toast.error(message);
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend(input);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0F1623] z-50">
      <div className="bg-[#111827] border-b border-[#1E293B] px-2 py-2.5 flex items-center gap-2 shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 border-secondary-foreground">
          <ArrowLeft className="w-4.5 h-4.5 text-destructive-foreground" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1A8CFF] to-[#0EA5E9] flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-[#F1F5F9] truncate">Naseer Medical AI Assistant</h1>
          <p className="text-[10px] text-[#64748B]">Pharmacy Assistant • Online</p>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-accent"
        >
          <Settings className="w-4 h-4 text-[#94A3B8]" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1A8CFF] to-[#0EA5E9] flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className="max-w-[80%]">
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#2A2A2A] text-[#F1F5F9] rounded-br-md"
                    : "bg-[#1B2B3A] text-[#E2E8F0] rounded-bl-md border border-[#1E3A50]"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === "assistant" && i === messages.length - 1 && (
                <p className="text-[9px] text-[#475569] mt-1 px-1">
                  ⚕️ AI responses are for reference only. Always verify with a licensed pharmacist.
                </p>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-2 items-center">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1A8CFF] to-[#0EA5E9] flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-[#1B2B3A] border border-[#1E3A50] rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      {messages.length <= 2 && !isLoading && <SuggestionChips onSelect={(t) => doSend(t)} />}

      {/* Input */}
      <div className="shrink-0 bg-[#0F1623] px-3 pb-[env(safe-area-inset-bottom,8px)] pt-1">
        <div className="flex gap-2 items-end bg-[#111827] rounded-2xl border border-[#1E293B] px-3 py-2 mb-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1E293B] shrink-0">
            <Plus className="w-4 h-4 text-[#94A3B8]" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-[#F1F5F9] outline-none placeholder:text-[#64748B] max-h-24"
          />
          <button
            onClick={() => doSend(input)}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1A8CFF] shrink-0
              disabled:opacity-40 hover:bg-[#1578D9] transition-colors active:scale-95"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
      </div>

      <ChatSettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onTestConnection={handleTestConnection}
        isTestingConnection={isTestingConnection}
      />
    </div>
  );
};

export default ChatScreen;
