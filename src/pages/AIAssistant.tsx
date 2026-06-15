import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ChatMessage, { type ChatRole } from "@/components/ai/ChatMessage";
import TypingIndicator from "@/components/ai/TypingIndicator";
import ChatHeader from "@/components/ai/ChatHeader";
import ConversationSidebar, { type Conversation } from "@/components/ai/ConversationSidebar";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { useKeyboardInset } from "@/hooks/useKeyboardInsets";

interface Message {
  id?: string;
  role: ChatRole;
  content: string;
}

const SUGGESTIONS = [
  "আজকের বিক্রি কত?",
  "Stock kom ase kon medicine gulor?",
  "Top selling medicines this month",
  "Expire howar age ki ki ase?",
];

const WELCOME: Message = {
  role: "assistant",
  content:
    "**Assalamu Alaikum!** Ami apnar **MediNist AI assistant**. Inventory, sales, ba pharmacy niye je kono prosno korte paren — Bengali ba Banglish e likhleo cholbe.",
};

const AIAssistant = () => {
  const { user, profile, pharmacyName } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setElement } = useScrollContainer();
  const keyboardInset = useKeyboardInset();

  // Register the chat scroll container so BottomNav can react to scroll direction here.
  useEffect(() => {
    setElement(scrollRef.current);
    return () => setElement(null);
  }, [setElement]);

  // Load conversations & resume most recent on mount
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) {
        console.error(error);
        return;
      }
      const convs = data ?? [];
      setConversations(convs);
      if (convs.length > 0) {
        setActiveId(convs[0].id);
      }
    })();
  }, [user?.id]);

  // Load messages whenever active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([WELCOME]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, role, content")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });
      if (error) {
        console.error(error);
        return;
      }
      const loaded = (data ?? []).map((m) => ({
        id: m.id,
        role: m.role as ChatRole,
        content: m.content,
      }));
      setMessages(loaded.length > 0 ? loaded : [WELCOME]);
    })();
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const refreshConversations = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setConversations(data ?? []);
  };

  const ensureConversation = async (): Promise<string | null> => {
    if (activeId) return activeId;
    if (!user?.id || !profile?.pharmacy_id) {
      toast.error("Pharmacy not configured.");
      return null;
    }
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user.id,
        pharmacy_id: profile.pharmacy_id,
        title: "New chat",
      })
      .select("id, title, updated_at")
      .single();
    if (error || !data) {
      console.error(error);
      toast.error("Could not start a new chat.");
      return null;
    }
    setActiveId(data.id);
    setConversations((prev) => [data, ...prev]);
    return data.id;
  };

  const handleNewChat = () => {
    setActiveId(null);
    setMessages([WELCOME]);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete.");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([WELCOME]);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const convId = await ensureConversation();
    if (!convId) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages.filter((m) => m !== WELCOME || messages.length > 1), userMsg];
    setMessages((prev) => [...prev.filter((m) => m !== WELCOME || prev.length > 1), userMsg]);
    setInput("");
    setIsLoading(true);

    // Persist user message
    const { error: insertErr } = await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "user",
      content: trimmed,
    });
    if (insertErr) console.error("persist user msg:", insertErr);

    try {
      const history = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { messages: history },
      });

      if (error) throw error;

      let reply: string;
      if (data?.error) {
        reply =
          data.code === 429
            ? "Ektu busy achi, ekhon abar try korun."
            : data.code === 402
            ? "AI credits sesh. Please add funds to continue."
            : data.error;
      } else {
        reply = data.reply;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      await supabase.from("ai_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: reply,
      });
      refreshConversations();
    } catch (err) {
      console.error("AI chat error:", err);
      toast.error("Failed to reach AI assistant.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, kichu vul holo. Abar try korun." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const isWelcomeOnly = messages.length === 1 && messages[0] === WELCOME;

  return (
    <div className="fixed inset-0 flex h-[100dvh] flex-col bg-[#f8fafc]">
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-sky-300/20 blur-3xl"
      />

      <ChatHeader
        pharmacyName={pharmacyName}
        userName={profile?.full_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
        role={profile?.role ?? null}
        onToggleSidebar={() => setSidebarOpen(true)}
      />

      <ConversationSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => setActiveId(id)}
        onNewChat={handleNewChat}
        onDelete={handleDelete}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-3 pt-4"
        style={{
          paddingBottom: `calc(1rem + ${keyboardInset}px + env(safe-area-inset-bottom))`,
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((m, i) => (
            <ChatMessage key={m.id ?? i} role={m.role} content={m.content} />
          ))}
          {isLoading && <TypingIndicator />}

          {isWelcomeOnly && !isLoading && (
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Input Capsule */}
      <form
        onSubmit={handleSubmit}
        className="relative shrink-0 px-3 pt-2 pb-[15px]"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
          <button
            type="button"
            aria-label="Attach"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Plus className="h-5 w-5" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as FormEvent);
              }
            }}
            rows={1}
            placeholder={isLoading ? "AI is thinking..." : "Ask anything..."}
            disabled={isLoading}
            className="max-h-[120px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-9 w-9 shrink-0 rounded-xl bg-indigo-600 p-0 text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AIAssistant;
