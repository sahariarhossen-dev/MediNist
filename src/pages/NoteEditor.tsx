import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNote,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  type Note,
  type NoteBlock,
  type NoteColor,
} from "@/hooks/useNotes";
import { uploadNoteAttachment } from "@/lib/notesStorage";
import { toast } from "sonner";
import KeyboardAvoidingScroll from "@/components/ui/keyboard-avoiding-scroll";
import { colorHex } from "@/components/notes/ColorPicker";
import BlockText, { type BlockTextHandle } from "@/components/notes/blocks/BlockText";
import BlockChecklist from "@/components/notes/blocks/BlockChecklist";
import BlockImage from "@/components/notes/blocks/BlockImage";
import NoteKeyboardToolbar from "@/components/notes/NoteKeyboardToolbar";
import { cn } from "@/lib/utils";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface DraftState {
  title: string;
  content: NoteBlock[];
  color: NoteColor;
  is_public: boolean;
  // Preserved fields (not edited in this clean UI)
  contact_numbers: string[];
  tags: string[];
  is_pinned: boolean;
}

const makeEmpty = (): DraftState => ({
  title: "",
  content: [{ id: newId(), type: "text", html: "" }],
  color: "default",
  is_public: false,
  contact_numbers: [],
  tags: [],
  is_pinned: false,
});

const NoteEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isNew = !id || id === "new";

  const { data: existing, isLoading } = useNote(id);
  const createMut = useCreateNote();
  const updateMut = useUpdateNote();
  const deleteMut = useDeleteNote();

  const [draft, setDraft] = useState<DraftState>(makeEmpty);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileCategoryRef = useRef<"invoice" | "prescription" | "photo">("photo");
  const textRef = useRef<BlockTextHandle | null>(null);
  // Latest draft, kept in a ref so the debounced save always sees fresh data
  // without having to re-create the timer on every keystroke.
  const draftRef = useRef<DraftState>(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const noteId = savedNoteId ?? (isNew ? null : id ?? null);
  const readOnly = !!existing && existing.creator_id !== user?.id;

  // Hydrate from existing
  useEffect(() => {
    if (existing) {
      setDraft({
        title: existing.title ?? "",
        content:
          existing.content && existing.content.length > 0
            ? existing.content
            : [{ id: newId(), type: "text", html: "" }],
        color: existing.color,
        is_public: existing.is_public,
        contact_numbers: existing.contact_numbers ?? [],
        tags: existing.tags ?? [],
        is_pinned: existing.is_pinned,
      });
    }
  }, [existing]);

  // ---- block helpers ----
  const updateBlock = (blockId: string, patch: Partial<NoteBlock>) => {
    setDraft((d) => ({
      ...d,
      content: d.content.map((b) =>
        b.id === blockId ? ({ ...b, ...patch } as NoteBlock) : b,
      ),
    }));
  };

  const removeBlock = (blockId: string) => {
    setDraft((d) => {
      const next = d.content.filter((b) => b.id !== blockId);
      return {
        ...d,
        content:
          next.length > 0 ? next : [{ id: newId(), type: "text", html: "" }],
      };
    });
  };

  const addBlock = (block: NoteBlock) => {
    setDraft((d) => ({ ...d, content: [...d.content, block] }));
  };

  const buildPayload = (state: DraftState): Partial<Note> => {
    const images = state.content.filter((b) => b.type === "image") as Extract<
      NoteBlock,
      { type: "image" }
    >[];
    return {
      title: state.title || null,
      content: state.content,
      contact_numbers: state.contact_numbers,
      tags: state.tags,
      color: state.color,
      is_pinned: state.is_pinned,
      is_public: state.is_public,
      image_metadata: {
        urls: images.map((i) => i.url),
        categories: images.map((i) => i.category ?? "photo"),
        ocr_text: null,
      },
    };
  };

  // Has the user typed anything worth saving?
  const hasContent = useMemo(() => {
    if (draft.title.trim()) return true;
    return draft.content.some((b) => {
      if (b.type === "text") return b.html.replace(/<[^>]*>/g, "").trim().length > 0;
      if (b.type === "checklist") return b.items.some((i) => i.text.trim());
      if (b.type === "image") return true;
      return false;
    });
  }, [draft]);

  // Silent 3-second debounced autosave. We only schedule a single timer that
  // reads the latest draft from the ref, so React state updates (typing) do
  // not re-render or fire mutations on every keystroke.
  useEffect(() => {
    if (readOnly || isLoading) return;
    if (!noteId) return;
    const handle = setTimeout(() => {
      updateMut.mutate({ id: noteId, patch: buildPayload(draftRef.current) });
    }, 3000);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, noteId]);

  const ensureSaved = async (): Promise<string | null> => {
    if (noteId) return noteId;
    const created = await createMut.mutateAsync(buildPayload(draft));
    setSavedNoteId(created.id);
    window.history.replaceState(null, "", `/more/notes/${created.id}`);
    return created.id;
  };

  const handleBack = async () => {
    if (readOnly) {
      navigate(-1);
      return;
    }
    try {
      if (!noteId && hasContent) {
        await ensureSaved();
      } else if (noteId) {
        await updateMut.mutateAsync({ id: noteId, patch: buildPayload(draft) });
      }
      navigate("/more/notes");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save note");
    }
  };

  const handleDelete = async () => {
    if (!noteId) {
      navigate("/more/notes");
      return;
    }
    if (!confirm("Delete this note?")) return;
    try {
      await deleteMut.mutateAsync(noteId);
      toast.success("Note deleted");
      navigate("/more/notes");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete note");
    }
  };

  const handleDuplicate = async () => {
    try {
      const created = await createMut.mutateAsync(buildPayload(draft));
      toast.success("Note duplicated");
      navigate(`/more/notes/${created.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to duplicate");
    }
  };

  // ---- attachments ----
  const triggerImagePicker = (category: "invoice" | "prescription" | "photo") => {
    fileCategoryRef.current = category;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!profile?.pharmacy_id) {
      toast.error("No pharmacy linked to your account");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    setUploading(true);
    try {
      const id = await ensureSaved();
      if (!id) throw new Error("Could not create note");
      const { path, url } = await uploadNoteAttachment(file, profile.pharmacy_id, id);
      addBlock({
        id: newId(),
        type: "image",
        path,
        url,
        category: fileCategoryRef.current,
      });
    } catch (err) {
      console.error(err);
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAddChecklist = () => {
    addBlock({
      id: newId(),
      type: "checklist",
      items: [{ text: "", checked: false }],
    });
  };

  // ---- text editing exec ----
  const exec = (cmd: string, value?: string) => {
    const el = textRef.current?.el();
    if (el && document.activeElement !== el) el.focus();
    try {
      document.execCommand(cmd, false, value);
    } catch {
      // ignore
    }
    if (el) {
      // sync change for the text block
      const html = el.innerHTML;
      const textBlock = draft.content.find((b) => b.type === "text") as
        | Extract<NoteBlock, { type: "text" }>
        | undefined;
      if (textBlock) updateBlock(textBlock.id, { html });
    }
  };

  // First text block is the primary editable surface
  const primaryText = draft.content.find((b) => b.type === "text") as
    | Extract<NoteBlock, { type: "text" }>
    | undefined;

  return (
    <div
      className={cn("min-h-screen w-full max-w-3xl mx-auto bg-gray-100")}
      style={{ backgroundColor: colorHex(draft.color) }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 backdrop-blur border-b border-gray-100 px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: `${colorHex(draft.color)}cc` }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        {/* Silent background sync — no status text */}
        <div className="flex-1" />
        {readOnly && (
          <span className="text-xs text-gray-500">Read only</span>
        )}
        {uploading && <Loader2 size={16} className="animate-spin text-gray-400" />}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
      />

      <KeyboardAvoidingScroll
        className="px-4 pt-4"
        style={{ paddingBottom: "96px" }}
      >
        {/* Title */}
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="Title"
          readOnly={readOnly}
          className="w-full text-2xl font-semibold bg-transparent border-0 outline-none placeholder:text-gray-400 text-gray-900 mb-3"
        />

        {/* Primary note body */}
        {primaryText && (
          <BlockText
            ref={textRef}
            html={primaryText.html}
            readOnly={readOnly}
            placeholder="Note"
            onChange={(html) => updateBlock(primaryText.id, { html })}
          />
        )}

        {/* Inserted blocks (image / checklist) appear below the body */}
        <div className="space-y-3 mt-4">
          {draft.content
            .filter((b) => b.id !== primaryText?.id)
            .map((block) => (
              <div key={block.id} className="relative group">
                {block.type === "checklist" && (
                  <BlockChecklist
                    items={block.items}
                    readOnly={readOnly}
                    onChange={(items) => updateBlock(block.id, { items })}
                  />
                )}
                {block.type === "image" && (
                  <BlockImage
                    url={block.url}
                    path={block.path}
                    caption={block.caption}
                    category={block.category}
                    readOnly={readOnly}
                    onChange={(p) => updateBlock(block.id, p)}
                  />
                )}
                {block.type === "text" && (
                  <BlockText
                    html={block.html}
                    readOnly={readOnly}
                    onChange={(html) => updateBlock(block.id, { html })}
                  />
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    className="absolute -top-2 -right-2 bg-white border border-gray-200 rounded-full p-1 text-gray-400 hover:text-red-500 opacity-80"
                    aria-label="Remove block"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
        </div>
      </KeyboardAvoidingScroll>

      {!readOnly && (
        <NoteKeyboardToolbar
          color={draft.color}
          onColorChange={(c) => setDraft((d) => ({ ...d, color: c }))}
          isShared={draft.is_public}
          onShareChange={(v) => setDraft((d) => ({ ...d, is_public: v }))}
          onAddImage={triggerImagePicker}
          onAddChecklist={handleAddChecklist}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          exec={exec}
          canDelete={!!noteId}
        />
      )}
    </div>
  );
};

export default NoteEditor;