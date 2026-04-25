import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pin,
  Palette,
  Trash2,
  Loader2,
  Type,
  ListChecks,
  Image as ImageIcon,
  Receipt,
  FileText,
  Tag,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import KeyboardAvoidingScroll from "@/components/ui/keyboard-avoiding-scroll";
import ColorPicker, { colorBg } from "@/components/notes/ColorPicker";
import ContactChips from "@/components/notes/ContactChips";
import BlockText from "@/components/notes/blocks/BlockText";
import BlockChecklist from "@/components/notes/blocks/BlockChecklist";
import BlockImage from "@/components/notes/blocks/BlockImage";
import { cn } from "@/lib/utils";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface DraftState {
  title: string;
  content: NoteBlock[];
  contact_numbers: string[];
  tags: string[];
  color: NoteColor;
  is_pinned: boolean;
  is_public: boolean;
}

const emptyDraft: DraftState = {
  title: "",
  content: [{ id: newId(), type: "text", html: "" }],
  contact_numbers: [],
  tags: [],
  color: "default",
  is_pinned: false,
  is_public: false,
};

const NoteEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isNew = !id || id === "new";

  const { data: existing, isLoading } = useNote(id);
  const createMut = useCreateNote();
  const updateMut = useUpdateNote();
  const deleteMut = useDeleteNote();

  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [tagDraft, setTagDraft] = useState("");
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileCategoryRef = useRef<"invoice" | "prescription" | "photo">("photo");
  const [uploading, setUploading] = useState(false);

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
        contact_numbers: existing.contact_numbers ?? [],
        tags: existing.tags ?? [],
        color: existing.color,
        is_pinned: existing.is_pinned,
        is_public: existing.is_public,
      });
    }
  }, [existing]);

  const updateBlock = (blockId: string, patch: Partial<NoteBlock>) => {
    setDraft((d) => ({
      ...d,
      content: d.content.map((b) =>
        b.id === blockId ? ({ ...b, ...patch } as NoteBlock) : b,
      ),
    }));
  };

  const removeBlock = (blockId: string) => {
    setDraft((d) => ({ ...d, content: d.content.filter((b) => b.id !== blockId) }));
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

  // Debounced autosave
  useEffect(() => {
    if (readOnly) return;
    if (isLoading) return;
    if (isNew && !savedNoteId) return; // wait for explicit save
    if (!noteId) return;

    const handle = setTimeout(() => {
      updateMut.mutate({ id: noteId, patch: buildPayload(draft) });
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, noteId]);

  const ensureSaved = async (): Promise<string | null> => {
    if (noteId) return noteId;
    const created = await createMut.mutateAsync(buildPayload(draft));
    setSavedNoteId(created.id);
    // Replace URL so subsequent visits resolve to the saved note
    window.history.replaceState(null, "", `/more/notes/${created.id}`);
    return created.id;
  };

  const handleSaveExit = async () => {
    if (readOnly) {
      navigate(-1);
      return;
    }
    try {
      const id = await ensureSaved();
      if (id) {
        await updateMut.mutateAsync({ id, patch: buildPayload(draft) });
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

  const addTag = () => {
    const v = tagDraft.trim().replace(/^#/, "");
    if (!v) return;
    if (draft.tags.includes(v)) {
      setTagDraft("");
      return;
    }
    setDraft((d) => ({ ...d, tags: [...d.tags, v] }));
    setTagDraft("");
  };

  const removeTag = (t: string) => {
    setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }));
  };

  const headerStatus = useMemo(() => {
    if (readOnly) return "Read only";
    if (createMut.isPending || updateMut.isPending) return "Saving...";
    if (!noteId && isNew) return "Unsaved";
    return "Saved";
  }, [readOnly, createMut.isPending, updateMut.isPending, noteId, isNew]);

  return (
    <div className={cn("min-h-screen w-full max-w-3xl mx-auto", colorBg(draft.color))}>
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveExit}
          aria-label="Back"
          className="p-2 -ml-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <span className="text-xs text-gray-500 flex-1 truncate">{headerStatus}</span>

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, is_pinned: !d.is_pinned }))}
              aria-label={draft.is_pinned ? "Unpin" : "Pin"}
              className={cn(
                "p-2 rounded-full hover:bg-gray-100",
                draft.is_pinned && "text-amber-600",
              )}
            >
              <Pin size={18} className={draft.is_pinned ? "fill-amber-500" : ""} />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Color"
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-700"
                >
                  <Palette size={18} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3">
                <ColorPicker
                  value={draft.color}
                  onChange={(c) => setDraft((d) => ({ ...d, color: c }))}
                />
              </PopoverContent>
            </Popover>

            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                aria-label="Delete"
                className="p-2 rounded-full hover:bg-red-50 text-red-500"
              >
                <Trash2 size={18} />
              </button>
            )}
          </>
        )}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
      />

      <KeyboardAvoidingScroll className="px-4 py-4 space-y-4">
        {/* Title */}
        <Input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="Title"
          readOnly={readOnly}
          className="text-lg font-semibold border-0 bg-transparent shadow-none px-0 focus-visible:ring-0"
        />

        {/* Shared toggle */}
        {!readOnly && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Shared with Team</p>
              <p className="text-xs text-gray-500">
                {draft.is_public
                  ? "Visible to everyone in your pharmacy"
                  : "Private to you"}
              </p>
            </div>
            <Switch
              checked={draft.is_public}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, is_public: v }))}
            />
          </div>
        )}

        {/* Blocks */}
        <div className="space-y-3">
          {draft.content.map((block) => (
            <div key={block.id} className="relative group">
              {block.type === "text" && (
                <BlockText
                  html={block.html}
                  readOnly={readOnly}
                  onChange={(html) => updateBlock(block.id, { html })}
                />
              )}
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
              {!readOnly && draft.content.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="absolute -top-2 -right-2 bg-white border border-gray-200 rounded-full p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove block"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add block toolbar */}
        {!readOnly && (
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Add block
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addBlock({ id: newId(), type: "text", html: "" })}
                className="justify-start"
              >
                <Type size={14} className="mr-1.5" /> Text
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  addBlock({
                    id: newId(),
                    type: "checklist",
                    items: [{ text: "", checked: false }],
                  })
                }
                className="justify-start"
              >
                <ListChecks size={14} className="mr-1.5" /> List
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => triggerImagePicker("photo")}
                disabled={uploading}
                className="justify-start"
              >
                {uploading ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <ImageIcon size={14} className="mr-1.5" />
                )}
                Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => triggerImagePicker("invoice")}
                disabled={uploading}
                className="justify-start"
              >
                <Receipt size={14} className="mr-1.5" /> Invoice
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => triggerImagePicker("prescription")}
                disabled={uploading}
                className="justify-start col-span-2 sm:col-span-1"
              >
                <FileText size={14} className="mr-1.5" /> Rx
              </Button>
            </div>
          </div>
        )}

        {/* Contact numbers */}
        <section className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Contact Numbers
          </h3>
          <ContactChips
            numbers={draft.contact_numbers}
            readOnly={readOnly}
            onChange={(contact_numbers) => setDraft((d) => ({ ...d, contact_numbers }))}
          />
        </section>

        {/* Tags */}
        <section className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            {draft.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 text-xs"
              >
                <Tag size={10} />#{t}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="ml-1 text-gray-400 hover:text-red-500"
                    aria-label={`Remove tag ${t}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {draft.tags.length === 0 && readOnly && (
              <span className="text-xs text-gray-400">No tags</span>
            )}
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag"
                className="h-9"
              />
              <Button
                type="button"
                size="sm"
                onClick={addTag}
                className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              >
                Add
              </Button>
            </div>
          )}
        </section>

        {readOnly && existing && (
          <p className="text-center text-xs text-gray-500 pt-2">
            Shared note — read only
          </p>
        )}
      </KeyboardAvoidingScroll>
    </div>
  );
};

export default NoteEditor;