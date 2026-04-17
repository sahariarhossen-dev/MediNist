import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ChatMessage, { type ChatRole } from "@/components/ai/ChatMessage";
import TypingIndicator from "@/components/ai/TypingIndicator";
import ChatHeader from "@/components/ai/ChatHeader";
import ConversationSidebar, { type Conversation } from "@/components/ai/ConversationSidebar";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";

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
  const { setElement } = useScrollContainer();

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
  };

  const isWelcomeOnly = messages.length === 1 && messages[0] === WELCOME;

  return (
    <div className="fixed inset-0 flex flex-col bg-white h-[100dvh]">
      <ChatHeader
        pharmacyName={pharmacyName}
        userName={profile?.full_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
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
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pill Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t bg-white px-3 py-3 pl-[5px] pr-[5px] pb-[15px] pt-[15px] shadow-sm opacity-100 border-solid border-secondary rounded-xl"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1.5 shadow-sm focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-md pl-[20px] pr-[20px] pb-[10px] pt-[10px] mb-[10px] ml-[5px] mr-[5px]">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "AI is thinking..." : "Ask anything..."}
            disabled={isLoading}
            className="h-9 flex-1 border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 p-0 shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40"
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
