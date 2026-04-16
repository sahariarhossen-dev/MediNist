import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ChatMessage, { type ChatRole } from "@/components/ai/ChatMessage";
import TypingIndicator from "@/components/ai/TypingIndicator";

interface Message {
  role: ChatRole;
  content: string;
}

const SUGGESTIONS = [
  "What's my current stock level?",
  "Show today's sales summary",
  "Which items are running low?",
  "Top selling medicines this month",
];

const AIAssistant = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your **MediNist AI assistant**. I can help you understand your inventory, sales, and pharmacy operations. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const history = nextMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { messages: history },
      });

      if (error) throw error;

      if (data?.error) {
        const friendly =
          data.code === 429
            ? "I'm a bit busy right now. Please try again in a moment."
            : data.code === 402
            ? "AI credits exhausted. Please add funds to continue."
            : data.error;
        setMessages((prev) => [...prev, { role: "assistant", content: friendly }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch (err) {
      console.error("AI chat error:", err);
      toast.error("Failed to reach AI assistant. Please try again.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white pb-24">
      {/* Header */}
      <header className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-4 shadow-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-white">MediNist AI</h1>
          <p className="flex items-center gap-1.5 text-xs text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Online · Powered by Gemini
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((m, i) => (
            <ChatMessage key={i} role={m.role} content={m.content} />
          ))}
          {isLoading && <TypingIndicator />}

          {messages.length === 1 && !isLoading && (
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-100 bg-white px-3 py-3"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "AI is thinking..." : "Ask anything about your pharmacy..."}
            disabled={isLoading}
            className="h-11 flex-1 rounded-full border-gray-200 bg-gray-50 px-4 text-sm focus-visible:ring-blue-500"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 p-0 shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AIAssistant;
