import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Slash,
  ArrowUp,
  Mic,
  Square,
  ImagePlus,
  Loader2,
  X,
  LayoutPanelLeft,
  Link2,
  AtSign,
  Pencil,
  Pin,
  Eraser,
  Archive,
} from "lucide-react";
import ChatTopBar from "@/components/chat/ChatTopBar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useThreadPrefs } from "@/lib/threadPrefs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ChatMessage, { type ChatRole } from "@/components/ai/ChatMessage";
import TypingIndicator from "@/components/ai/TypingIndicator";
import AiCanvas from "@/components/ai/AiCanvas";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { useKeyboardInset } from "@/hooks/useKeyboardInsets";
import SlashCommandMenu, { type SlashCommand } from "@/components/ai/SlashCommandMenu";
import ForwardToStaffDrawer from "@/components/workspace/ForwardToStaffDrawer";
import StockLookupDrawer from "@/components/workspace/StockLookupDrawer";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { useAiThreads } from "@/hooks/useAiThreads";
import { getTopic, topicFocus } from "@/lib/aiTopics";
import {
  deriveActions,
  deriveSuggestions,
  forwardableText,
  parseAgentMessage,
  type AgentAction,
} from "@/lib/agentCards";
import { markAiReplied, markThreadSeen, setAiThinking } from "@/lib/aiActivity";
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

const initials = (n?: string | null) =>
  (n || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const AIAssistant = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user, profile, pharmacyName } = useAuth();
  const { staff } = usePharmacyStaff();
  const { threads } = useAiThreads();

  const [title, setTitle] = useState("MediNist AI");
  const [topicKey, setTopicKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridge, setBridge] = useState<{ id: string; title: string; summary: string } | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [pendingMention, setPendingMention] = useState<string | null>(null);
  const [stockDrawer, setStockDrawer] = useState<{ mode: "stock" | "reorder"; query: string } | null>(
    null
  );
  const [forward, setForward] = useState<{
    content: string;
    prefix?: string;
    title: string;
    query?: string;
    /** Index of the assistant message this forward belongs to. */
    index: number | null;
  } | null>(null);
  const [receipts, setReceipts] = useState<Record<number, string>>({});
  const [attachment, setAttachment] = useState<InlineImage | null>(null);
  const [recorder, setRecorder] = useState<VoiceRecorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { isPinned, togglePin } = useThreadPrefs();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setElement } = useScrollContainer();
  const keyboardInset = useKeyboardInset();

  const topic = getTopic(topicKey);
  const TopicIcon = topic.icon;

  // Register the chat scroll container so BottomNav can react to scroll direction here.
  useEffect(() => {
    setElement(scrollRef.current);
    return () => setElement(null);
  }, [setElement]);

  // Load this topic thread (metadata + messages). RLS already restricts the row
  // to its owner, so an unknown id simply resolves to nothing.
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    let active = true;
    (async () => {
      const { data: conv, error } = await supabase
        .from("ai_conversations")
        .select("id, title, topic_key")
        .eq("id", conversationId)
        .maybeSingle();
      if (!active) return;
      if (error || !conv) {
        toast.error("Topic not found.");
        navigate("/workspace", { replace: true });
        return;
      }
      setTitle(conv.title);
      setTopicKey(conv.topic_key);

      const { data: msgs } = await supabase
        .from("ai_messages")
        .select("id, role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (!active) return;
      setMessages(
        (msgs ?? []).map((m) => ({ id: m.id, role: m.role as ChatRole, content: m.content }))
      );
      markThreadSeen(conversationId);
    })();
    return () => {
      active = false;
    };
  }, [conversationId, user?.id, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const canvasCards = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return [];
    const parsed = parseAgentMessage(last.content);
    return [...(parsed.block?.cards ?? []), ...parsed.jsonCards];
  }, [messages]);

  const sendMessage = async (text: string, image?: InlineImage | null) => {
    const trimmed = text.trim();
    if ((!trimmed && !image) || isLoading || !conversationId) return;

    const promptText =
      trimmed ||
      "এই ছবিটি (প্রেসক্রিপশন / ইনভয়েস) পড়ে গুরুত্বপূর্ণ তথ্য গুছিয়ে দিন।";
    const shown = image ? `${promptText}\n\n_📎 ${image.name} সংযুক্ত করা হয়েছে_` : promptText;

    const userMsg: Message = { role: "user", content: shown };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setAttachment(null);
    setIsLoading(true);
    setAiThinking(true, conversationId);

    const { error: insertErr } = await supabase.from("ai_messages").insert({
      conversation_id: conversationId,
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
      const { data: sessionData } = await supabase.auth.getSession();
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

      const invoke = (token: string) =>
        supabase.functions.invoke("ai-chat", {
          headers: { Authorization: `Bearer ${token}` },
          body: {
            messages: history,
            topic_focus: topicFocus(topicKey),
            ...(bridge ? { bridged_context: `From "${bridge.title}":\n${bridge.summary}` } : {}),
            ...(image ? { images: [{ mimeType: image.mimeType, data: image.data }] } : {}),
          },
        });

      let { data, error } = await invoke(accessToken);

      if (error) {
        // One retry with a forcibly refreshed token for stale-session 401s.
        const { data: retryAuth } = await supabase.auth.refreshSession();
        const retryToken = retryAuth?.session?.access_token;
        if (!retryToken) {
          toast.error("Session expired. Please sign in again.");
          await supabase.auth.signOut();
          return;
        }
        ({ data, error } = await invoke(retryToken));
        if (error) throw error;
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
        conversation_id: conversationId,
        role: "assistant",
        content: reply,
      });
      markAiReplied();
      markThreadSeen(conversationId);
      if (topic.canvas !== "none") setCanvasOpen(true);

      // @mention in the prompt → offer to hand the answer to that teammate.
      if (pendingMention) {
        setForward({
          content: forwardableText(reply),
          prefix: "✅ Task from owner:",
          title: `Assign to ${pendingMention}`,
          query: pendingMention,
          index: null,
        });
        setPendingMention(null);
      }
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
    if (index !== messages.length - 1) return [];
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

  const pickMention = (name: string) => {
    setMentionOpen(false);
    setPendingMention(name);
    setInput((prev) => `${prev.replace(/@$/, "")}@${name} `.trimStart());
    textareaRef.current?.focus();
  };

  const pickBridge = async (id: string, threadTitle: string) => {
    setBridgeOpen(false);
    const { data } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(6);
    const summary = (data ?? [])
      .reverse()
      .map((m) => `${m.role === "user" ? "Q" : "A"}: ${forwardableText(m.content).slice(0, 240)}`)
      .join("\n");
    if (!summary) {
      toast.error("That topic has no messages to bridge yet.");
      return;
    }
    setBridge({ id, title: threadTitle, summary });
    toast.success(`Bridged context from “${threadTitle}”`);
  };

  const renameThread = async () => {
    const next = renameValue.trim();
    if (!conversationId || !next) return;
    setRenameOpen(false);
    const { error } = await supabase
      .from("ai_conversations")
      .update({ title: next })
      .eq("id", conversationId);
    if (error) {
      toast.error("Could not rename this topic.");
      return;
    }
    setTitle(next);
    toast.success("Topic renamed.");
  };

  const clearHistory = async () => {
    if (!conversationId) return;
    const { error } = await supabase
      .from("ai_messages")
      .delete()
      .eq("conversation_id", conversationId);
    if (error) {
      toast.error("Could not clear this thread.");
      return;
    }
    setMessages([]);
    setReceipts({});
    toast.success("Chat history cleared.");
  };

  const archiveThread = async () => {
    if (!conversationId) return;
    const { error } = await supabase
      .from("ai_conversations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (error) {
      toast.error("Could not archive this thread.");
      return;
    }
    toast.success("Thread archived.");
    navigate("/workspace", { replace: true });
  };

  const isEmptyThread = messages.length === 0;
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="fixed inset-0 flex h-[100dvh] flex-col bg-chat-canvas">
      {/* Telegram-style thread header */}
      <ChatTopBar
        onBack={() => navigate("/workspace")}
        onIdentityClick={() => setInfoOpen(true)}
        avatar={
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-[0_0_0_3px_hsl(160_84%_39%/0.12),0_4px_12px_-4px_hsl(160_84%_39%/0.55)]">
            <TopicIcon className="h-4 w-4" />
            <span
              aria-hidden
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background ${
                isLoading ? "animate-pulse" : ""
              }`}
            />
          </span>
        }
        title={title}
        subtitle={
          <>
            <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700">
              {bridge ? `Linked: ${bridge.title}` : topic.label}
            </span>
            <span className="truncate">
              {isLoading ? "Thinking…" : pharmacyName ?? "MediNist AI"}
            </span>
          </>
        }
        actions={
          topic.canvas !== "none" ? (
            <button
              type="button"
              onClick={() => setCanvasOpen((v) => !v)}
              aria-label="Toggle canvas view"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-emerald-500/40 active:scale-95 ${
                canvasOpen ? "text-emerald-600" : "text-foreground/70"
              }`}
            >
              <LayoutPanelLeft className="h-5 w-5" />
            </button>
          ) : null
        }
        menu={
          <>
            <DropdownMenuItem className="gap-2.5 rounded-xl py-2.5" onSelect={() => setBridgeOpen(true)}>
              <Link2 className="h-4 w-4 text-emerald-600" />
              Link Topic
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => {
                setRenameValue(title);
                setRenameOpen(true);
              }}
            >
              <Pencil className="h-4 w-4 text-emerald-600" />
              Rename Topic
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => conversationId && togglePin(conversationId)}
            >
              <Pin className="h-4 w-4 text-emerald-600" />
              {conversationId && isPinned(conversationId) ? "Unpin Thread" : "Pin Thread"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => setClearOpen(true)}
            >
              <Eraser className="h-4 w-4 text-muted-foreground" />
              Clear History
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => setArchiveOpen(true)}
            >
              <Archive className="h-4 w-4 text-muted-foreground" />
              Archive Thread
            </DropdownMenuItem>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-4 pt-4"
          style={{
            paddingBottom: `calc(1rem + ${keyboardInset}px + env(safe-area-inset-bottom))`,
          }}
        >
          {isEmptyThread && !isLoading ? (
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
              <div className="mt-3 max-w-xl animate-fade-in-up">
                <ChatMessage role="assistant" content={topic.greeting} />
              </div>

              <div className="mt-8 grid animate-fade-in-up grid-cols-1 gap-3 sm:grid-cols-2">
                {topic.quickPrompts.map((text) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white">
                      <TopicIcon className="h-4 w-4" />
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

        {/* Desktop split canvas */}
        <AiCanvas
          topicKey={topicKey}
          cards={canvasCards}
          open={canvasOpen}
          onClose={() => setCanvasOpen(false)}
          variant="pane"
        />
      </div>

      {/* Mobile canvas sheet */}
      <AiCanvas
        topicKey={topicKey}
        cards={canvasCards}
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        variant="sheet"
      />

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
              if (v.endsWith("@")) setMentionOpen(true);
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
                : `Ask about ${topic.label.toLowerCase()}… use @ to tag staff`
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
              <button
                type="button"
                aria-label="Mention a teammate"
                onClick={() => setMentionOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
              >
                <AtSign className="h-5 w-5" />
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

      {/* @mention picker */}
      <Sheet open={mentionOpen} onOpenChange={setMentionOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6">
          <SheetHeader className="px-5 text-left">
            <SheetTitle className="text-base">Tag a teammate</SheetTitle>
          </SheetHeader>
          <div className="max-h-[45vh] overflow-y-auto pt-2">
            {staff.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No teammates yet.</p>
            )}
            {staff.map((s) => (
              <button
                key={s.user_id}
                onClick={() => pickMention((s.full_name || "Teammate").split(" ")[0])}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-slate-50"
              >
                <Avatar className="h-9 w-9">
                  {s.avatar_url ? <AvatarImage src={s.avatar_url} /> : null}
                  <AvatarFallback className="bg-blue-500 text-xs font-semibold text-white">
                    {initials(s.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {s.full_name || "Member"}
                  </p>
                  <p className="text-xs capitalize text-slate-500">{s.role || "salesman"}</p>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Context bridge picker */}
      <Sheet open={bridgeOpen} onOpenChange={setBridgeOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6">
          <SheetHeader className="px-5 text-left">
            <SheetTitle className="text-base">Bridge another topic</SheetTitle>
          </SheetHeader>
          <div className="max-h-[45vh] overflow-y-auto pt-2">
            {bridge && (
              <button
                onClick={() => {
                  setBridge(null);
                  setBridgeOpen(false);
                }}
                className="w-full px-5 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                Remove bridge ({bridge.title})
              </button>
            )}
            {threads
              .filter((t) => t.id !== conversationId)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickBridge(t.id, t.title)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {t.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {t.last_message || getTopic(t.topic_key).label}
                    </span>
                  </span>
                </button>
              ))}
            {threads.filter((t) => t.id !== conversationId).length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No other topics to bridge yet.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
        initialQuery={forward?.query}
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
