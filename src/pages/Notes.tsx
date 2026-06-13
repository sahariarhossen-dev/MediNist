import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Lightbulb } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotes, usePharmacyMembers, useNotesRealtime } from "@/hooks/useNotes";
import NoteCard from "@/components/notes/NoteCard";
import NoteSearchBar from "@/components/notes/NoteSearchBar";
import NotesMenu, { type NotesFilterMode } from "@/components/notes/NotesMenu";
import { cn } from "@/lib/utils";

const Notes = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: notes = [], isLoading } = useNotes();
  const { data: members = [] } = usePharmacyMembers();
  useNotesRealtime();

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<NotesFilterMode>("all");
  const [view, setView] = useState<"masonry" | "list">("masonry");
  const [menuOpen, setMenuOpen] = useState(false);

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

  const avatarFallback =
    (profile?.full_name?.trim().charAt(0) || user?.email?.charAt(0) || "U").toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 w-full max-w-3xl mx-auto pb-32">
      <NotesMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Header — Google Keep style */}
      <header className="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md px-3 pt-4 pb-3 border-b border-slate-100/60 dark:border-slate-800/40">
        <NoteSearchBar
          value={search}
          onChange={setSearch}
          onMenuClick={() => setMenuOpen(true)}
          view={view}
          onToggleView={() => setView((v) => (v === "masonry" ? "list" : "masonry"))}
          avatarUrl={profile?.avatar_url}
          avatarFallback={avatarFallback}
          onAvatarClick={() => navigate("/profile")}
        />
        {mode !== "all" && (
          <div className="mt-2 px-2">
            <span className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
              {mode === "pinned" && "Pinned"}
              {mode === "mine" && "My notes"}
              {mode === "shared" && "Shared with team"}
            </span>
          </div>
        )}
      </header>

      {/* Grid */}
      <main className="px-3 pt-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center text-center py-20 text-gray-400">
            <Lightbulb size={64} strokeWidth={1.2} className="mb-3" />
            <p className="text-sm">Notes you add appear here</p>
          </div>
        ) : (
          <div
            className={cn(
              "gap-2",
              view === "masonry"
                ? "columns-2 md:columns-3"
                : "flex flex-col max-w-xl mx-auto",
            )}
          >
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

      {/* FAB — Keep style: white pill, blue plus */}
      <button
        type="button"
        onClick={() => navigate("/more/notes/new")}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-2xl bg-white hover:bg-gray-50 text-[#2563eb] shadow-[0_4px_14px_rgba(0,0,0,0.18)] border border-gray-100 flex items-center justify-center z-30 transition active:scale-95"
        aria-label="New note"
      >
        <Plus size={28} strokeWidth={2.2} />
      </button>
    </div>
  );
};

export default Notes;
