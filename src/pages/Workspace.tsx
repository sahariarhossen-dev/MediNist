import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageSquarePlus, Search, X, Inbox, Sparkles, Users } from "lucide-react";
import InboxRow from "@/components/messaging/InboxRow";
import NewChatSheet from "@/components/messaging/NewChatSheet";
import AiThreadRow from "@/components/workspace/AiThreadRow";
import { useChatInbox } from "@/hooks/useChatInbox";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { useAiThreads } from "@/hooks/useAiThreads";
import { supabase } from "@/integrations/supabase/client";
import { isThreadUnseen, useAiActivity } from "@/lib/aiActivity";
import { useThreadPrefs } from "@/lib/threadPrefs";
import { roleLabel } from "@/lib/staffRoles";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { toast } from "sonner";

type Filter = "all" | "unread" | "ai" | "staff";
type Presence = "online" | "away" | null;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "ai", label: "MediNist AI" },
  { id: "staff", label: "Shop Messages" },
];

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: "No conversations yet",
    body: "Start one with your team or open a new AI topic from the compose button.",
  },
  unread: {
    title: "You're all caught up",
    body: "New replies from your team or the AI co-pilot will show up here.",
  },
  ai: {
    title: "No AI topics yet",
    body: "Tap compose → MediNist AI to open a topic like Sales Analysis or Expiring Medicines.",
  },
  staff: {
    title: "No shop messages",
    body: "Tap the compose button to message a teammate or create a group.",
  },
};

const Workspace = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { rooms, loading, refresh } = useChatInbox();
  const { staff } = usePharmacyStaff();
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

  const roleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) if (s.role) m.set(s.user_id, roleLabel(s.role));
    return m;
  }, [staff]);

  const q = query.trim().toLowerCase();

  const roomUnread = (roomId: string, count: number) => count > 0 && !isMuted(roomId);
  const threadUnread = (id: string, role: string | null, at: string | null) =>
    isThreadUnseen(id, role, at) && !isMuted(`ai:${id}`);

  // Only real conversations render: a room with no messages and no resolvable
  // counterpart name is not shown as a placeholder row.
  const visibleRooms = useMemo(
    () =>
      rooms.filter(
        (r) => r.last_message || (r.display_name && r.display_name !== "Teammate")
      ),
    [rooms]
  );

  // Pinned threads float to the top; the rest keep the inbox's recency order.
  const filteredRooms = useMemo(() => {
    const list = visibleRooms.filter(
      (r) =>
        (!q || r.display_name.toLowerCase().includes(q)) &&
        (filter !== "unread" || roomUnread(r.room_id, r.unread_count))
    );
    return [...list].sort((a, b) => {
      const pa = isPinned(a.room_id) ? 1 : 0;
      const pb = isPinned(b.room_id) ? 1 : 0;
      return pb - pa;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRooms, q, filter, isPinned, isMuted]);

  const filteredThreads = useMemo(() => {
    const list = threads.filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q)) &&
        (filter !== "unread" || threadUnread(t.id, t.last_role, t.last_message_at))
    );
    return [...list].sort((a, b) => {
      const pa = isPinned(`ai:${a.id}`) ? 1 : 0;
      const pb = isPinned(`ai:${b.id}`) ? 1 : 0;
      return pb - pa;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, q, filter, isPinned, isMuted]);

  const unreadCount = useMemo(
    () =>
      visibleRooms.filter((r) => roomUnread(r.room_id, r.unread_count)).length +
      threads.filter((t) => threadUnread(t.id, t.last_role, t.last_message_at)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRooms, threads, isMuted]
  );

  const showStaff = filter === "all" || filter === "staff" || filter === "unread";
  const showAi = filter === "all" || filter === "ai" || filter === "unread";

  const busy = loading || aiLoading;
  const rendered =
    (showAi ? filteredThreads.length : 0) + (showStaff ? filteredRooms.length : 0);
  const showEmpty = !busy && rendered === 0;

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

  const EmptyIcon = filter === "ai" ? Sparkles : filter === "staff" ? Users : Inbox;

  return (
    <div
      ref={scrollRef}
      className="min-h-[calc(100vh-72px)] overflow-y-auto bg-slate-50/80 pb-28"
    >
      <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="flex items-baseline gap-2 px-4 pt-3">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Chats</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="px-4 pt-2.5">
          <div className="group relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics, teammates or groups"
              className="h-11 w-full rounded-full border border-slate-200/80 bg-slate-100/70 pl-10 pr-10 text-[13.5px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-all placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200/80 text-slate-500 transition hover:bg-slate-300/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-all duration-200 ${
                  active
                    ? "bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-white font-medium text-slate-500 ring-1 ring-slate-200/80 hover:text-slate-800 hover:ring-slate-300"
                }`}
              >
                {f.label}
                {f.id === "unread" && unreadCount > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.15)]">
          {/* AI topic threads */}
          {showAi &&
            filteredThreads.map((t) => (
              <div key={t.id} className="border-b border-slate-100 last:border-b-0">
                <AiThreadRow
                  thread={t}
                  unread={threadUnread(t.id, t.last_role, t.last_message_at)}
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
          {showStaff &&
            filteredRooms.map((r) => (
              <div key={r.room_id} className="border-b border-slate-100 last:border-b-0">
                <InboxRow
                  room={r}
                  fallbackName={
                    r.other_user_id ? roleMap.get(r.other_user_id) ?? null : null
                  }
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
              </div>
            ))}

          {busy && rendered === 0 && (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-12 w-12 animate-pulse rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filter-aware empty states */}
          {showEmpty && (
            <div className="flex flex-col items-center px-8 py-16 text-center">
              <span className="relative mb-4 flex h-20 w-20 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-emerald-500/5" />
                <span className="absolute inset-3 rounded-full bg-emerald-500/10" />
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                  <EmptyIcon className="h-5 w-5" />
                </span>
              </span>
              <p className="text-[15px] font-semibold tracking-tight text-slate-900">
                {q ? "No matches" : EMPTY_COPY[filter].title}
              </p>
              <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-slate-500">
                {q ? "Try a different name or keyword." : EMPTY_COPY[filter].body}
              </p>
              {!q && filter !== "unread" && (
                <button
                  type="button"
                  onClick={() => {
                    setAiFirst(filter === "ai");
                    setNewOpen(true);
                  }}
                  className="mt-5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                >
                  {filter === "ai" ? "New AI topic" : "Start a chat"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          setAiFirst(false);
          setNewOpen(true);
        }}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_10px_30px_-8px_rgba(16,185,129,0.6)] ring-1 ring-emerald-400/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-10px_rgba(16,185,129,0.65)] active:translate-y-0 active:scale-95"
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
