import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageSquarePlus, Search } from "lucide-react";
import InboxRow from "@/components/messaging/InboxRow";
import NewChatSheet from "@/components/messaging/NewChatSheet";
import { useChatInbox } from "@/hooks/useChatInbox";
import { Input } from "@/components/ui/input";

const Messages = () => {
  const navigate = useNavigate();
  const { rooms, loading } = useChatInbox();
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.display_name.toLowerCase().includes(q));
  }, [rooms, query]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-3 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button
          onClick={() => navigate("/", { replace: true })}
          className="h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Messages</h1>
      </div>
      <div className="px-3 py-2 bg-white border-b">
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

      <div className="bg-white">
        {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">
            No conversations yet. Tap the green button to start one.
          </div>
        )}
        {filtered.map((r) => (
          <InboxRow key={r.room_id} room={r} onClick={() => navigate(`/messages/${r.room_id}`)} />
        ))}
      </div>

      <button
        onClick={() => setNewOpen(true)}
        className="fixed bottom-24 right-5 h-14 w-14 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg flex items-center justify-center"
        aria-label="New chat"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>

      <NewChatSheet open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
};

export default Messages;