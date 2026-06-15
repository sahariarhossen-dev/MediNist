import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Globe, ArrowUp, TrendingUp, PackageSearch, Trophy, CalendarClock } from "lucide-react";
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

const SUGGESTIONS: { text: string; icon: typeof TrendingUp }[] = [
  { text: "আজকের বিক্রি কত?", icon: TrendingUp },
  { text: "Stock kom ase kon medicine gulor?", icon: PackageSearch },
  { text: "Top selling medicines this month", icon: Trophy },
  { text: "Expire howar age ki ki ase?", icon: CalendarClock },
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
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="fixed inset-0 flex h-[100dvh] flex-col bg-white">
      <ChatHeader
        pharmacyName={pharmacyName}
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
        className="relative flex-1 overflow-y-auto px-4 pt-4"
        style={{
          paddingBottom: `calc(1rem + ${keyboardInset}px + env(safe-area-inset-bottom))`,
        }}
      >
        {isWelcomeOnly && !isLoading ? (
          <div className="relative mx-auto flex h-full max-w-2xl flex-col justify-center pb-6">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-200/40 via-sky-200/30 to-emerald-200/30 blur-3xl"
            />
            <h2 className="animate-fade-in-up text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
              Hello,{" "}
              <span className="bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 bg-clip-text text-transparent">
                {firstName}
              </span>
            </h2>
            <p className="mt-2 animate-fade-in-up text-base text-slate-500">
              How can I help you today?
            </p>

            <div className="mt-8 grid animate-fade-in-up grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map(({ text, icon: Icon }) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm leading-snug text-slate-700">{text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-6">
            {messages.map((m, i) => (
              <ChatMessage
                key={m.id ?? i}
                role={m.role}
                content={m.content}
                userName={profile?.full_name ?? null}
                userAvatarUrl={profile?.avatar_url ?? null}
              />
            ))}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Floating Composer Card */}
      <form onSubmit={handleSubmit} className="relative shrink-0 px-3 pt-2 pb-[15px]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-3xl border border-slate-200/80 bg-white px-4 pb-2 pt-3 shadow-sm transition-all duration-200 focus-within:border-slate-300 focus-within:shadow-md">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as FormEvent);
              }
            }}
            rows={1}
            placeholder={isLoading ? "MediNist is thinking..." : "Ask MediNist anything…"}
            disabled={isLoading}
            className="max-h-[140px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Attach"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
              >
                <Plus className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Tools"
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
              >
                <Globe className="h-4 w-4" />
                Tools
              </button>
            </div>
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={
                "h-9 w-9 shrink-0 rounded-full p-0 transition-all duration-200 " +
                (input.trim() && !isLoading
                  ? "scale-100 bg-slate-900 text-white hover:bg-slate-800"
                  : "scale-95 bg-slate-200 text-slate-400 hover:bg-slate-200")
              }
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AIAssistant;
