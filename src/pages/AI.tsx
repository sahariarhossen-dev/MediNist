import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Bot, User, Loader2, ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "medinistai_chat_history";
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-pharmacy`;

const DEFAULT_MSG: Msg = {
  role: "assistant",
  content:
    "আসসালামু আলাইকুম! 👋 I'm **MediNist AI**, your pharmacy assistant for Naseer Medical Hall.\n\nI can help you with:\n- 📦 Inventory queries\n- 💰 Sales reports\n- 💊 Medicine suggestions\n\nHow can I help you today?",
};

const loadMessages = (): Msg[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [DEFAULT_MSG];
};

const saveMessages = (msgs: Msg[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch { /* ignore */ }
};

const AI = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>(loadMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages on every change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleClear = useCallback(() => {
    setMessages([DEFAULT_MSG]);
    toast.success("Chat cleared");
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please log in to use the AI assistant.");
      setIsLoading(false);
      return;
    }

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user" && prev[prev.length - 2]?.content === text) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const allMessages = [...messages.slice(1), userMsg].map(({ role, content }) => ({ role, content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }

      if (!assistantSoFar) {
        upsertAssistant("I'm sorry, I couldn't generate a response. Please try again.");
      }
    } catch (e: any) {
      console.error("Chat error:", e);
      toast.error(e.message || "Failed to get response");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${e.message || "Something went wrong. Please try again."}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F4F6FB] z-50">
      {/* Header */}
      <div className="bg-white border-b px-2 py-2.5 flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-foreground truncate">MediNist AI Assistant</h1>
          <p className="text-[10px] font-semibold text-secondary-foreground">Pharmacy Assistant • Naseer Medical Hall</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleClear}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-white text-foreground border rounded-bl-md shadow-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {isLoading && !messages[messages.length - 1]?.content && (
          <div className="flex gap-2 items-center">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white border rounded-2xl px-3 py-2 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 bg-[#F4F6FB] px-3 pb-[env(safe-area-inset-bottom,8px)] pt-1">
        <div className="flex gap-2 items-end bg-white rounded-2xl border shadow-sm px-3 py-2 my-[25px]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about stock, sales, medicines..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-24"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 rounded-full shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AI;
