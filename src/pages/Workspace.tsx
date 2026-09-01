import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageSquarePlus, Search, Megaphone, Inbox, BellOff } from "lucide-react";
import InboxRow from "@/components/messaging/InboxRow";
import NewChatSheet from "@/components/messaging/NewChatSheet";
import AiThreadRow from "@/components/workspace/AiThreadRow";
import { useChatInbox } from "@/hooks/useChatInbox";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { useSystemAlerts } from "@/components/workspace/AlertsThread";
import { useAiThreads } from "@/hooks/useAiThreads";
import { supabase } from "@/integrations/supabase/client";
import { isThreadUnseen, useAiActivity } from "@/lib/aiActivity";
import { useThreadPrefs } from "@/lib/threadPrefs";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Filter = "all" | "ai" | "staff" | "alerts";
type Presence = "online" | "away" | null;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ai", label: "AI Topics" },
  { id: "staff", label: "Staff Messages" },
  { id: "alerts", label: "System Alerts" },
];

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: "No conversations yet",
    body: "Start one with your team or open a new AI topic from the compose button.",
  },
  ai: {
    title: "No AI topics yet",
    body: "Tap compose → MediNist AI to create a topic like Sales Analysis or Expiring Medicines.",
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
  const [params, setParams] = useSearchParams();
  const { rooms, loading, refresh } = useChatInbox();
  const { staff } = usePharmacyStaff();
  const { alerts } = useSystemAlerts();
  const { threads, loading: aiLoading, refresh: refreshAi } = useAiThreads();
  const ai = useAiActivity();
  const { isPinned, isMuted, togglePin, toggleMute } = useThreadPrefs();
  const { setElement } = useScrollContainer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [aiFirst, setAiFirst] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [tick, setTick] = useState(0);

  // Single scroll container so the bottom nav hides/shows consistently here.
  useEffect(() => {
    setElement(scrollRef.current);
    return () => setElement(null);
  }, [setElement]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // `/workspace?new=ai` (used by the legacy /workspace/ai resolver) opens the
  // topic modal directly.
  useEffect(() => {
    if (params.get("new") === "ai") {
      setAiFirst(true);
      setNewOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const filteredThreads = useMemo(() => {
    const list = threads.filter((t) => !q || t.title.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const pa = isPinned(`ai:${a.id}`) ? 1 : 0;
      const pb = isPinned(`ai:${b.id}`) ? 1 : 0;
      return pb - pa;
    });
  }, [threads, q, isPinned]);

  const showAlerts =
    (filter === "all" || filter === "alerts") && (!q || "system alerts".includes(q));
  const showStaff = filter === "all" || filter === "staff";
  const showAi = filter === "all" || filter === "ai";
  const urgentAlerts = alerts.filter((a) => a.is_urgent).length;

  const staffEmpty = !loading && filteredRooms.length === 0;
  const aiEmpty = !aiLoading && filteredThreads.length === 0;
  const alertsEmpty = alerts.length === 0;

  const showEmpty =
    (filter === "staff" && staffEmpty) ||
    (filter === "ai" && aiEmpty) ||
    (filter === "alerts" && alertsEmpty) ||
    (filter === "all" && staffEmpty && aiEmpty && alertsEmpty);

  const renameThread = async (id: string, current: string) => {
    const next = window.prompt("Topic title", current);
    if (!next?.trim()) return;
    const { error } = await supabase
      .from("ai_conversations")
      .update({ title: next.trim().slice(0, 60) })
      .eq("id", id);
    if (error) {
      toast.error("Could not rename the topic.");
      return;
    }
    refreshAi();
  };

  const archiveThread = async (id: string) => {
    const { error } = await supabase
      .from("ai_conversations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Could not archive the topic.");
      return;
    }
    toast.success("Topic archived");
    refreshAi();
  };

  return (
    <div ref={scrollRef} className="min-h-[calc(100vh-72px)] overflow-y-auto bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-3">
        <h1 className="flex-1 text-lg font-bold text-gray-900">Chats</h1>
      </div>

      <div className="bg-white px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics, teammates or groups"
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

        {/* AI topic threads */}
        {showAi &&
          filteredThreads.map((t) => (
            <div key={t.id} className="border-b border-slate-100 last:border-b-0">
              <AiThreadRow
                thread={t}
                unread={isThreadUnseen(t.id, t.last_role, t.last_message_at)}
                thinking={ai.thinking && ai.thinkingThread === t.id}
                pinned={isPinned(`ai:${t.id}`)}
                muted={isMuted(`ai:${t.id}`)}
                onClick={() => navigate(`/workspace/ai/${t.id}`)}
                onTogglePin={() => togglePin(`ai:${t.id}`)}
                onToggleMute={() => toggleMute(`ai:${t.id}`)}
                onRename={() => renameThread(t.id, t.title)}
                onArchive={() => archiveThread(t.id)}
              />
            </div>
          ))}

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
                  await supabase.rpc("mark_room_read", { _room_id: r.room_id });
                  refresh();
                }}
                onClick={() => navigate(`/workspace/room/${r.room_id}`)}
              />
            ))}
          </>
        )}

        {/* Filter-aware empty states */}
        {showEmpty && (
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
        onClick={() => {
          setAiFirst(false);
          setNewOpen(true);
        }}
        className="fixed bottom-24 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_30px_rgb(16,185,129,0.3)] transition-all duration-200 hover:scale-105 hover:bg-emerald-600 active:scale-95"
        aria-label="New chat"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>

      <NewChatSheet
        key={aiFirst ? "ai" : "plain"}
        open={newOpen}
        onOpenChange={setNewOpen}
        aiFirst={aiFirst}
      />
    </div>
  );
};

export default Workspace;
