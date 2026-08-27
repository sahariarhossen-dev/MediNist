import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquarePlus,
  Search,
  Megaphone,
  Sparkles,
  ChevronRight,
  Pin,
  Inbox,
  BellOff,
} from "lucide-react";
import InboxRow from "@/components/messaging/InboxRow";
import NewChatSheet from "@/components/messaging/NewChatSheet";
import { useChatInbox } from "@/hooks/useChatInbox";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { useSystemAlerts } from "@/components/workspace/AlertsThread";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { relativeTime } from "@/lib/relativeTime";
import { forwardableText } from "@/lib/agentCards";
import { hasUnseenAiReply, useAiActivity } from "@/lib/aiActivity";
import { useThreadPrefs } from "@/lib/threadPrefs";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { Input } from "@/components/ui/input";

type Filter = "all" | "ai" | "staff" | "alerts";
type Presence = "online" | "away" | null;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ai", label: "AI Co-pilot" },
  { id: "staff", label: "Staff Messages" },
  { id: "alerts", label: "System Alerts" },
];

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: "Your workspace is quiet",
    body: "Start a chat with a teammate or ask the AI co-pilot anything about your shop.",
  },
  ai: {
    title: "No AI history yet",
    body: "Open the co-pilot and ask about today's sales, short items or dues.",
  },
  staff: {
    title: "No staff conversations",
    body: "Tap the compose button to message a teammate or create a group.",
  },
  alerts: {
    title: "No system alerts",
    body: "Broadcasts and urgent shop notices will appear here.",
  },
};

const Workspace = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rooms, loading, refresh } = useChatInbox();
  const { staff } = usePharmacyStaff();
  const { alerts } = useSystemAlerts();
  const ai = useAiActivity();
  const { isPinned, isMuted, togglePin, toggleMute } = useThreadPrefs();
  const { setElement } = useScrollContainer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [tick, setTick] = useState(0);
  const [aiPreview, setAiPreview] = useState<{ text: string; at: string } | null>(null);

  // Single scroll container so the bottom nav hides/shows consistently here.
  useEffect(() => {
    setElement(scrollRef.current);
    return () => setElement(null);
  }, [setElement]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Last AI turn, used as the pinned co-pilot row preview.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: convs } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      const convId = convs?.[0]?.id;
      if (!convId) return;
      const { data: msgs } = await supabase
        .from("ai_messages")
        .select("content, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = msgs?.[0];
      if (!cancelled && last) {
        setAiPreview({ text: forwardableText(last.content).slice(0, 120), at: last.created_at });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, ai.lastAssistantAt]);

  const presenceMap = useMemo(() => {
    const m = new Map<string, Presence>();
    const now = Date.now();
    for (const s of staff) {
      if (!s.last_seen) continue;
      const diff = now - new Date(s.last_seen).getTime();
      if (diff < 2 * 60_000) m.set(s.user_id, "online");
      else if (diff < 10 * 60_000) m.set(s.user_id, "away");
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, tick]);

  const q = query.trim().toLowerCase();

  // Pinned threads float to the top; the rest keep the inbox's recency order.
  const filteredRooms = useMemo(() => {
    const list = rooms.filter((r) => !q || r.display_name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const pa = isPinned(a.room_id) ? 1 : 0;
      const pb = isPinned(b.room_id) ? 1 : 0;
      return pb - pa;
    });
  }, [rooms, q, isPinned]);

  const showAI = (filter === "all" || filter === "ai") && (!q || "medinist ai co-pilot".includes(q));
  const showAlerts =
    (filter === "all" || filter === "alerts") && (!q || "system alerts".includes(q));
  const showStaff = filter === "all" || filter === "staff";
  const urgentAlerts = alerts.filter((a) => a.is_urgent).length;
  const aiUnseen = hasUnseenAiReply(ai);

  const staffEmpty = showStaff && !loading && filteredRooms.length === 0;
  const alertsEmpty = filter === "alerts" && alerts.length === 0;

  return (
    <div ref={scrollRef} className="min-h-[calc(100vh-72px)] overflow-y-auto bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-3">
        <h1 className="flex-1 text-lg font-bold text-gray-900">Workspace</h1>
      </div>

      <div className="bg-white px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search AI, teammates or groups"
            className="border-0 bg-gray-100 pl-9"
          />
        </div>
      </div>

      <div className="border-b border-slate-100 bg-white">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-3">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={
                  active
                    ? "shrink-0 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white"
                    : "shrink-0 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs text-slate-600 transition-all hover:bg-slate-200/70"
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white">
        {/* Pinned AI Co-pilot */}
        {showAI && (
          <button
            onClick={() => navigate("/workspace/ai")}
            className="flex w-full items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 to-transparent px-4 py-3.5 text-left transition-colors hover:bg-indigo-50/80"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white">
              <Sparkles className="h-5 w-5" />
              {ai.thinking && (
                <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-indigo-400/60" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[14.5px] font-semibold text-slate-900">
                  MediNist AI (Co-pilot)
                </p>
                <Pin className="h-3 w-3 shrink-0 text-indigo-400" />
              </div>
              {ai.thinking ? (
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-indigo-600">
                  Thinking
                  <span className="flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-500" />
                  </span>
                </p>
              ) : (
                <p className="truncate text-[12.5px] text-slate-500">
                  {aiPreview?.text || "Ask about sales, stock, dues or medicines — anytime."}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {aiPreview && !ai.thinking && (
                <span className="text-[10.5px] text-slate-400">{relativeTime(aiPreview.at)}</span>
              )}
              {aiUnseen ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10.5px] font-semibold text-white">
                  1
                </span>
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-300" />
              )}
            </div>
          </button>
        )}

        {/* System alerts thread */}
        {showAlerts && !alertsEmpty && (
          <button
            onClick={() => navigate("/workspace/alerts")}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/60"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Megaphone className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-semibold text-slate-900">System Alerts</p>
              <p className="truncate text-[12.5px] text-slate-500">
                {alerts[0]?.message || "No active broadcasts"}
              </p>
            </div>
            {urgentAlerts > 0 && (
              <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                {urgentAlerts}
              </span>
            )}
          </button>
        )}

        {/* Staff threads */}
        {showStaff && (
          <>
            {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
            {filteredRooms.map((r) => (
              <InboxRow
                key={r.room_id}
                room={r}
                presence={r.other_user_id ? presenceMap.get(r.other_user_id) ?? null : null}
                pinned={isPinned(r.room_id)}
                muted={isMuted(r.room_id)}
                onTogglePin={() => togglePin(r.room_id)}
                onToggleMute={() => toggleMute(r.room_id)}
                onMarkRead={async () => {
                  await supabase.rpc("mark_room_read", { p_room_id: r.room_id });
                  refresh();
                }}
                onClick={() => navigate(`/workspace/room/${r.room_id}`)}
              />
            ))}
          </>
        )}

        {/* Filter-aware empty states */}
        {((filter === "staff" && staffEmpty) ||
          (filter === "alerts" && alertsEmpty) ||
          (filter === "all" && staffEmpty && alerts.length === 0)) && (
          <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              {filter === "alerts" ? (
                <BellOff className="h-5 w-5" />
              ) : (
                <Inbox className="h-5 w-5" />
              )}
            </span>
            <p className="text-sm font-semibold text-slate-800">
              {q ? "No matches" : EMPTY_COPY[filter].title}
            </p>
            <p className="max-w-xs text-[12.5px] leading-relaxed text-slate-500">
              {q ? "Try a different name or keyword." : EMPTY_COPY[filter].body}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => setNewOpen(true)}
        className="fixed bottom-24 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_30px_rgb(16,185,129,0.3)] transition-all duration-200 hover:scale-105 hover:bg-emerald-600 active:scale-95"
        aria-label="New chat"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>

      <NewChatSheet open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
};

export default Workspace;
