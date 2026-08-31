import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Slash,
  ArrowUp,
  TrendingUp,
  PackageSearch,
  Trophy,
  CalendarClock,
  Mic,
  Square,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react";
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
import SlashCommandMenu, { type SlashCommand } from "@/components/ai/SlashCommandMenu";
import ForwardToStaffDrawer from "@/components/workspace/ForwardToStaffDrawer";
import StockLookupDrawer from "@/components/workspace/StockLookupDrawer";
import {
  deriveActions,
  deriveSuggestions,
  forwardableText,
  type AgentAction,
} from "@/lib/agentCards";
import { markAiReplied, markAiSeen, setAiThinking } from "@/lib/aiActivity";
import {
  fileToInlineImage,
  startVoiceRecording,
  transcribeAudio,
  type InlineImage,
  type VoiceRecorder,
} from "@/lib/voiceImage";

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
  const [slashOpen, setSlashOpen] = useState(false);
  const [stockDrawer, setStockDrawer] = useState<{ mode: "stock" | "reorder"; query: string } | null>(
    null
  );
  const [forward, setForward] = useState<{
    content: string;
    prefix?: string;
    title: string;
    /** Index of the assistant message this forward belongs to. */
    index: number | null;
  } | null>(null);
  const [receipts, setReceipts] = useState<Record<number, string>>({});
  const [attachment, setAttachment] = useState<InlineImage | null>(null);
  const [recorder, setRecorder] = useState<VoiceRecorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setElement } = useScrollContainer();
  const keyboardInset = useKeyboardInset();

  // Register the chat scroll container so BottomNav can react to scroll direction here.
  useEffect(() => {
    setElement(scrollRef.current);
    return () => setElement(null);
  }, [setElement]);

  // The AI thread is in view: clear the unread state shown on the inbox row.
  useEffect(() => {
    markAiSeen();
  }, []);

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

  const sendMessage = async (text: string, image?: InlineImage | null) => {
    const trimmed = text.trim();
    if ((!trimmed && !image) || isLoading) return;

    const convId = await ensureConversation();
    if (!convId) return;

    const promptText =
      trimmed ||
      "এই ছবিটি (প্রেসক্রিপশন / ইনভয়েস) পড়ে গুরুত্বপূর্ণ তথ্য গুছিয়ে দিন।";
    const shown = image ? `${promptText}\n\n_📎 ${image.name} সংযুক্ত করা হয়েছে_` : promptText;

    const userMsg: Message = { role: "user", content: shown };
    const nextMessages = [...messages.filter((m) => m !== WELCOME || messages.length > 1), userMsg];
    setMessages((prev) => [...prev.filter((m) => m !== WELCOME || prev.length > 1), userMsg]);
    setInput("");
    setAttachment(null);
    setIsLoading(true);
    setAiThinking(true);

    // Persist user message
    const { error: insertErr } = await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "user",
      content: shown,
    });
    if (insertErr) console.error("persist user msg:", insertErr);

    try {
      const history = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m, i, arr) => ({
          role: m.role,
          content: image && i === arr.length - 1 ? promptText : m.content,
        }));

      // The stored access token can reference a session that no longer exists
      // server-side (revoked / rotated), which makes the edge function reply 401.
      // Refresh first and use the fresh token explicitly.
      let { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData?.session?.access_token;
      const expiresAt = sessionData?.session?.expires_at ?? 0;
      if (!accessToken || expiresAt * 1000 - Date.now() < 60_000) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        accessToken = refreshed?.session?.access_token ?? accessToken;
      }
      if (!accessToken) {
        toast.error("Session expired. Please sign in again.");
        await supabase.auth.signOut();
        return;
      }

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          messages: history,
          ...(image ? { images: [{ mimeType: image.mimeType, data: image.data }] } : {}),
        },
      });

      if (error) {
        // One retry with a forcibly refreshed token for stale-session 401s.
        const { data: retryAuth } = await supabase.auth.refreshSession();
        const retryToken = retryAuth?.session?.access_token;
        if (!retryToken) {
          toast.error("Session expired. Please sign in again.");
          await supabase.auth.signOut();
          return;
        }
        const retry = await supabase.functions.invoke("ai-chat", {
          headers: { Authorization: `Bearer ${retryToken}` },
          body: {
            messages: history,
            ...(image ? { images: [{ mimeType: image.mimeType, data: image.data }] } : {}),
          },
        });
        if (retry.error) throw retry.error;
        Object.assign({}, retry);
        return await handleReply(retry.data, convId);
      }

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
      markAiReplied();
      markAiSeen();
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
      setAiThinking(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input, attachment);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    try {
      setAttachment(await fileToInlineImage(file));
    } catch (err) {
      toast.error((err as Error).message || "Could not read the image.");
    }
  };

  const toggleRecording = async () => {
    if (transcribing || isLoading) return;
    if (recorder) {
      const active = recorder;
      setRecorder(null);
      setTranscribing(true);
      try {
        const blob = await active.stop();
        if (!blob) {
          toast.error("Kichu record hoyni. Abar try korun.");
          return;
        }
        const text = await transcribeAudio(blob);
        if (!text) {
          toast.error("Kono kotha bujhte parini. Abar bolun.");
          return;
        }
        setInput((prev) => (prev ? `${prev.trim()} ${text}` : text));
        textareaRef.current?.focus();
      } catch (err) {
        console.error("transcription failed:", err);
        toast.error("Voice transcription failed.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    try {
      setRecorder(await startVoiceRecording());
    } catch (err) {
      console.error("mic error:", err);
      toast.error("Microphone access denied.");
    }
  };

  // Inline actions come from the message's own agent block when present;
  // otherwise they are derived from the question/answer intent.
  const questionFor = (index: number) =>
    [...messages.slice(0, index)].reverse().find((m) => m.role === "user")?.content ?? "";

  const actionsFor = (index: number): AgentAction[] => {
    const reply = messages[index];
    if (!reply || reply.role !== "assistant") return [];
    return deriveActions(questionFor(index), reply.content);
  };

  const suggestionsFor = (index: number): string[] => {
    const reply = messages[index];
    if (!reply || reply.role !== "assistant") return [];
    // Only the latest assistant reply offers follow-up chips.
    if (index !== messages.length - 1) return [];
    if (reply === WELCOME) return [];
    return deriveSuggestions(questionFor(index), reply.content);
  };

  const handleAction = (action: AgentAction, content: string, index: number) => {
    const text = forwardableText(content);
    if (action.id === "check_stock") {
      setStockDrawer({ mode: "stock", query: "" });
      return;
    }
    if (action.id === "reorder") {
      setStockDrawer({ mode: "reorder", query: "" });
      return;
    }
    if (action.id === "assign_task") {
      setForward({
        content: text,
        prefix: "✅ Task from owner:",
        title: "Assign task to staff",
        index,
      });
      return;
    }
    setForward({ content: text, title: "Forward to staff", index });
  };

  const isWelcomeOnly = messages.length === 1 && messages[0] === WELCOME;
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="fixed inset-0 flex h-[100dvh] flex-col bg-chat-canvas">
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
                actions={actionsFor(i)}
                onAction={(a, c) => handleAction(a, c, i)}
                suggestions={suggestionsFor(i)}
                onSuggestion={(p) => sendMessage(p)}
                receipt={receipts[i] ?? null}
              />
            ))}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Floating Composer Card */}
      <form onSubmit={handleSubmit} className="relative shrink-0 px-3 pt-2 pb-[15px]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-3xl border border-black/5 bg-white/70 px-4 pb-2 pt-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur transition-all duration-200 focus-within:border-black/10 focus-within:bg-white/90 focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {attachment && (
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100/80 p-2">
              <img
                src={attachment.preview}
                alt="Attached prescription or invoice"
                className="h-12 w-12 rounded-xl object-cover ring-1 ring-black/5"
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
                {attachment.name}
              </span>
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => setAttachment(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              if (v === "/") setSlashOpen(true);
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
            placeholder={
              recorder
                ? "Recording… tap the stop button when done"
                : transcribing
                ? "Transcribing your voice…"
                : isLoading
                ? "MediNist is thinking..."
                : "Ask MediNist anything…"
            }
            disabled={isLoading}
            className="max-h-[140px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Quick commands"
                onClick={() => setSlashOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
              >
                <Slash className="h-5 w-5" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={handlePickImage}
              />
              <button
                type="button"
                aria-label="Attach prescription or invoice"
                onClick={() => imageInputRef.current?.click()}
                disabled={isLoading}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95 disabled:opacity-40"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={recorder ? "Stop recording" : "Voice input"}
                onClick={toggleRecording}
                disabled={isLoading || transcribing}
                className={
                  "flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition active:scale-95 disabled:opacity-40 " +
                  (recorder
                    ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
                }
              >
                {transcribing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : recorder ? (
                  <>
                    <Square className="h-4 w-4" />
                    Stop
                  </>
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
            </div>
            <Button
              type="submit"
              disabled={isLoading || (!input.trim() && !attachment)}
              className={
                "h-9 w-9 shrink-0 rounded-full p-0 transition-all duration-200 " +
                ((input.trim() || attachment) && !isLoading
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

      <SlashCommandMenu
        open={slashOpen}
        onOpenChange={setSlashOpen}
        onSelect={(c: SlashCommand) => {
          setSlashOpen(false);
          sendMessage(c.prompt);
        }}
      />

      <StockLookupDrawer
        open={!!stockDrawer}
        onOpenChange={(v) => !v && setStockDrawer(null)}
        mode={stockDrawer?.mode ?? "stock"}
        initialQuery={stockDrawer?.query ?? ""}
        onCreateDraft={(draft) => {
          setStockDrawer(null);
          setForward({ content: draft, title: "Send re-order list", index: null });
        }}
      />

      <ForwardToStaffDrawer
        open={!!forward}
        onOpenChange={(v) => !v && setForward(null)}
        content={forward?.content ?? ""}
        prefix={forward?.prefix}
        title={forward?.title ?? "Forward to staff"}
        onSent={(receipt) => {
          const idx = forward?.index;
          if (typeof idx === "number") setReceipts((prev) => ({ ...prev, [idx]: receipt }));
        }}
      />
    </div>
  );
};

export default AIAssistant;
