import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ArrowLeft, Filter } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotes, usePharmacyMembers } from "@/hooks/useNotes";
import NoteCard from "@/components/notes/NoteCard";
import NoteSearchBar from "@/components/notes/NoteSearchBar";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "pinned" | "mine" | "shared";

const Notes = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: notes = [], isLoading } = useNotes();
  const { data: members = [] } = usePharmacyMembers();

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<FilterMode>("all");

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mem) => {
      if (mem.full_name) m.set(mem.user_id, mem.full_name);
    });
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (mode === "pinned" && !n.is_pinned) return false;
      if (mode === "mine" && n.creator_id !== user?.id) return false;
      if (mode === "shared" && (!n.is_public || n.creator_id === user?.id)) return false;

      if (!q) return true;
      const title = (n.title ?? "").toLowerCase();
      const tags = n.tags.join(" ").toLowerCase();
      const creatorName = (memberMap.get(n.creator_id) ?? "").toLowerCase();
      const textBlocks = n.content
        .filter((b) => b.type === "text")
        .map((b) => ("html" in b ? b.html : ""))
        .join(" ")
        .toLowerCase();
      return (
        title.includes(q) ||
        tags.includes(q) ||
        creatorName.includes(q) ||
        textBlocks.includes(q) ||
        n.contact_numbers.join(" ").includes(q)
      );
    });
  }, [notes, search, mode, user?.id, memberMap]);

  const filters: { key: FilterMode; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pinned", label: "Pinned" },
    { key: "mine", label: "Mine" },
    { key: "shared", label: "Shared" },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-3xl mx-auto pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#F4F6FB]/95 backdrop-blur px-4 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Smart Notepad</h1>
        </div>
        <NoteSearchBar value={search} onChange={setSearch} />
        <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar">
          <Filter size={14} className="text-gray-400 flex-shrink-0" />
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setMode(f.key)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition",
                mode === f.key
                  ? "bg-[#2563eb] text-white"
                  : "bg-white text-gray-600 border border-gray-200",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* Grid */}
      <main className="px-4 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-sm">No notes yet.</p>
            <p className="text-xs mt-1">Tap the + button to create your first note.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 md:columns-3 gap-3">
            {filtered.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                creatorName={memberMap.get(n.creator_id)}
                isMine={n.creator_id === user?.id}
                onClick={() => navigate(`/more/notes/${n.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAB */}
      <button
        type="button"
        onClick={() => navigate("/more/notes/new")}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg flex items-center justify-center z-30 transition"
        aria-label="New note"
      >
        <Plus size={26} />
      </button>
    </div>
  );
};

export default Notes;