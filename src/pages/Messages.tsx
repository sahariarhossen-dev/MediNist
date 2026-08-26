import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, Search } from "lucide-react";
import InboxRow from "@/components/messaging/InboxRow";
import NewChatSheet from "@/components/messaging/NewChatSheet";
import { useChatInbox } from "@/hooks/useChatInbox";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { Input } from "@/components/ui/input";

type Filter = "all" | "unread" | "groups" | "direct";
type Presence = "online" | "away" | null;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
  { id: "direct", label: "Direct" },
];

const Messages = () => {
  const navigate = useNavigate();
  const { rooms, loading } = useChatInbox();
  const { staff } = usePharmacyStaff();
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      if (q && !r.display_name.toLowerCase().includes(q)) return false;
      if (filter === "unread" && !(r.unread_count > 0)) return false;
      if (filter === "groups" && r.type !== "group") return false;
      if (filter === "direct" && r.type !== "direct") return false;
      return true;
    });
  }, [rooms, query, filter]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-3 py-3 flex items-center gap-2 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 flex-1">Messages</h1>
      </div>
      <div className="px-3 py-2 bg-white">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teammates or groups"
            className="pl-9 bg-gray-100 border-0"
          />
        </div>
      </div>
      <div className="bg-white border-b border-slate-100">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pb-3">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={
                  active
                    ? "shrink-0 bg-slate-900 text-white font-medium rounded-full text-xs px-3.5 py-1.5"
                    : "shrink-0 bg-slate-100 text-slate-600 hover:bg-slate-200/70 rounded-full text-xs px-3.5 py-1.5 transition-all"
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white">
        {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">
            {filter === "all" && !query
              ? "No conversations yet. Tap the green button to start one."
              : "No conversations match this filter."}
          </div>
        )}
        {filtered.map((r) => (
          <InboxRow
            key={r.room_id}
            room={r}
            presence={r.other_user_id ? presenceMap.get(r.other_user_id) ?? null : null}
            onClick={() => navigate(`/messages/${r.room_id}`)}
          />
        ))}
      </div>

      <button
        onClick={() => setNewOpen(true)}
        className="fixed bottom-24 right-5 h-14 w-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-[0_8px_30px_rgb(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all duration-200"
        aria-label="New chat"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>

      <NewChatSheet open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
};

export default Messages;