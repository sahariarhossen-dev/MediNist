import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ChatMessage from "./ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hi! 👋 I'm MediNist AI. How can I help you today?",
  timestamp: new Date(),
};

const FloatingChatBubble = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("gemini-chat", {
        body: { message: text },
      });

      if (error) {
        let msg = "Failed to get a response.";
        try {
          const body = error?.context?.body;
          if (typeof body === "string") {
            const parsed = JSON.parse(body);
            if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore parse errors */ }
        throw new Error(msg);
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.reply ?? "Sorry, I couldn't generate a response.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Chat error:", err);
      toast({
        title: "AI Error",
        description: err?.message || "Failed to get a response. Please try again.",
        variant: "destructive",
      });
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-[60] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Open chat"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shadow-md">
        <div className="flex items-center gap-2">
          <Bot size={20} />
          <span className="font-semibold text-base">MediNist AI</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-primary-foreground hover:bg-primary/80">
          <X size={20} />
        </Button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} content={msg.content} role={msg.role} timestamp={msg.timestamp} />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="flex gap-2 items-center px-4 py-2.5 bg-muted rounded-2xl rounded-bl-md">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3 flex items-center gap-2 bg-background">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1"
          disabled={isLoading}
        />
        <Button size="icon" onClick={handleSend} disabled={!input.trim() || isLoading} className="rounded-full shrink-0">
          <Send size={18} />
        </Button>
      </div>
    </div>
  );
};

export default FloatingChatBubble;
