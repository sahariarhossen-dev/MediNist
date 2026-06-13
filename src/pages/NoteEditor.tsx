import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNote,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  usePharmacyMembers,
  type Note,
  type NoteBlock,
  type NoteColor,
  type PharmacyMember,
} from "@/hooks/useNotes";
import { uploadNoteAttachment } from "@/lib/notesStorage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import KeyboardAvoidingScroll from "@/components/ui/keyboard-avoiding-scroll";
import BlockText, { type BlockTextHandle, type MentionTriggerState } from "@/components/notes/blocks/BlockText";
import BlockChecklist, { type BlockChecklistHandle } from "@/components/notes/blocks/BlockChecklist";
import BlockImage from "@/components/notes/blocks/BlockImage";
import NoteKeyboardToolbar from "@/components/notes/NoteKeyboardToolbar";
import AIActionSheet, { type AIAction } from "@/components/notes/AIActionSheet";
import AIProgressPill from "@/components/notes/AIProgressPill";
import MentionPopover, { filterMembers } from "@/components/notes/MentionPopover";
import ReminderDrawer from "@/components/notes/ReminderDrawer";
import ReminderBadge from "@/components/notes/ReminderBadge";
import { cn } from "@/lib/utils";

const MAX_CHARS = 2000;
const NEAR_LIMIT = 1800;

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
  /** ISO timestamp; persisted in a future migration. */
  reminder_at: string | null;
}

const makeEmpty = (): DraftState => ({
  title: "",
  content: [{ id: newId(), type: "text", html: "" }],
  color: "default",
  is_public: false,
  contact_numbers: [],
  tags: [],
  is_pinned: false,
  reminder_at: null,
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
  const [scanningBlockId, setScanningBlockId] = useState<string | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  // ---- mention state ----
  const { data: members = [] } = usePharmacyMembers();
  type MentionCtx =
    | { kind: "text"; blockId: string }
    | { kind: "checklist"; blockId: string; itemIndex: number };
  const [mention, setMention] = useState<
    (MentionTriggerState & { ctx: MentionCtx }) | null
  >(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const checklistRefs = useRef<Map<string, BlockChecklistHandle>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileCategoryRef = useRef<"invoice" | "prescription" | "photo">("photo");
  // Map of text-block id -> handle, so we can focus any text block by id
  // (used by the auto-cursor flow after inserting an image/checklist).
  const blockRefs = useRef<Map<string, BlockTextHandle>>(new Map());
  const focusBlockIdRef = useRef<string | null>(null);
  const nearLimitWarnedRef = useRef(false);
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
        reminder_at:
          (existing as unknown as { reminder_at?: string | null })?.reminder_at ?? null,
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

  /**
   * Append a non-text block at the end and immediately add a fresh empty
   * text block after it, then focus that new text block — Google-Keep /
   * MS-Word style "keep typing" flow.
   */
  const addBlockWithCursor = (block: NoteBlock) => {
    const trailingTextId = newId();
    setDraft((d) => ({
      ...d,
      content: [
        ...d.content,
        block,
        { id: trailingTextId, type: "text", html: "" },
      ],
    }));
    focusBlockIdRef.current = trailingTextId;
  };

  /** Insert a block immediately after the given block id, plus a trailing
   *  empty text block to keep the cursor flow consistent. */
  const insertBlockAfter = (afterId: string, block: NoteBlock) => {
    const trailingTextId = newId();
    setDraft((d) => {
      const idx = d.content.findIndex((b) => b.id === afterId);
      if (idx === -1) {
        return {
          ...d,
          content: [...d.content, block, { id: trailingTextId, type: "text", html: "" }],
        };
      }
      const next = [...d.content];
      next.splice(idx + 1, 0, block, { id: trailingTextId, type: "text", html: "" });
      return { ...d, content: next };
    });
    focusBlockIdRef.current = trailingTextId;
  };

  const estimateBlockChars = (block: NoteBlock): number => {
    if (block.type === "text") return block.html.replace(/<[^>]*>/g, "").length;
    if (block.type === "checklist") return block.items.reduce((s, it) => s + it.text.length, 0);
    return 0;
  };

  // After render, focus the queued text block (set by addBlockWithCursor).
  useEffect(() => {
    const id = focusBlockIdRef.current;
    if (!id) return;
    const handle = blockRefs.current.get(id);
    if (handle) {
      requestAnimationFrame(() => handle.focus());
      focusBlockIdRef.current = null;
    }
  }, [draft.content]);

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
      // TODO(phase-4): include `reminder_at` once the column lands.
    };
  };

  // ---- mention helpers ----
  const filteredMembers = useMemo(
    () => (mention ? filterMembers(members, mention.query) : []),
    [members, mention],
  );

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.query, mention?.ctx]);

  const handlePickMention = useCallback(
    (m: PharmacyMember) => {
      if (!mention) return;
      const name = m.full_name ?? "Unnamed";
      if (mention.ctx.kind === "text") {
        const handle = blockRefs.current.get(mention.ctx.blockId);
        handle?.insertMention({ user_id: m.user_id, name });
      } else {
        const handle = checklistRefs.current.get(mention.ctx.blockId);
        handle?.insertMention(mention.ctx.itemIndex, name);
      }
      setMention(null);
    },
    [mention],
  );

  // Global keyboard handler while popover is open
  useEffect(() => {
    if (!mention) return;
    const onKey = (e: KeyboardEvent) => {
      if (filteredMembers.length === 0 && e.key !== "Escape") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % Math.max(1, filteredMembers.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pick = filteredMembers[mentionIndex];
        if (pick) handlePickMention(pick);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mention, mentionIndex, filteredMembers, handlePickMention]);

  // ---- character counter ----
  const totalChars = useMemo(() => {
    let n = draft.title.length;
    for (const b of draft.content) {
      if (b.type === "text") {
        n += b.html.replace(/<[^>]*>/g, "").length;
      } else if (b.type === "checklist") {
        for (const it of b.items) n += it.text.length;
      }
    }
    return n;
  }, [draft]);

  const remaining = Math.max(0, MAX_CHARS - totalChars);

  useEffect(() => {
    if (totalChars >= NEAR_LIMIT && !nearLimitWarnedRef.current) {
      nearLimitWarnedRef.current = true;
      toast.warning("Approaching 2000 character limit");
    }
    if (totalChars < NEAR_LIMIT) {
      nearLimitWarnedRef.current = false;
    }
  }, [totalChars]);

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

  // Save-on-exit only: no autosave during typing. We keep all edits in local
  // React state (draft) and flush a single upsert when the editor unmounts
  // (back button, route change, tab close are handled separately by handleBack).
  // Refs below keep the latest values available to the unmount cleanup without
  // re-subscribing on every keystroke.
  const readOnlyRef = useRef(readOnly);
  const noteIdRef = useRef<string | null>(noteId);
  const hasContentRef = useRef(hasContent);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);
  useEffect(() => {
    hasContentRef.current = hasContent;
  }, [hasContent]);

  // Track whether handleBack already flushed, so the unmount cleanup doesn't
  // double-save.
  const flushedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (flushedRef.current) return;
      if (readOnlyRef.current) return;
      const latest = draftRef.current;
      const id = noteIdRef.current;
      if (id) {
        updateMut.mutate({ id, patch: buildPayload(latest) });
      } else if (hasContentRef.current) {
        createMut.mutate(buildPayload(latest));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      flushedRef.current = true;
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
      addBlockWithCursor({
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
    addBlockWithCursor({
      id: newId(),
      type: "checklist",
      items: [{ text: "", checked: false }],
    });
  };

  // ---- AI OCR (live) ----
  const stripHtml = (h: string) => h.replace(/<[^>]*>/g, "").trim();

  const handleScanImage = async (
    block: Extract<NoteBlock, { type: "image" }>,
  ) => {
    if (scanningBlockId) return;
    setScanningBlockId(block.id);
    try {
      // 1) fresh signed URL
      const { data: signed, error: signErr } = await supabase.storage
        .from("note-attachments")
        .createSignedUrl(block.path, 300);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("signed url failed");

      // 2) invoke edge function
      const { data, error } = await supabase.functions.invoke(
        "medinist-ai-notepad",
        {
          body: {
            mode: "ocr",
            category: block.category ?? "photo",
            payload: { imageUrl: signed.signedUrl },
          },
        },
      );
      if (error) throw error;
      const result: string = data?.result ?? "";
      if (!result) throw new Error("empty AI response");

      // 3) build block
      let newBlock: NoteBlock;
      let extractedCount = 0;
      if (block.category === "invoice") {
        if (!/<table/i.test(result)) throw new Error("invalid invoice html");
        newBlock = { id: newId(), type: "text", html: result };
        extractedCount = (result.match(/<tr/gi)?.length ?? 1) - 1;
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(result);
        } catch {
          // tolerate single-line fallback
          parsed = result
            .split("\n")
            .map((s) => s.replace(/^[-*\d.\s]+/, "").trim())
            .filter(Boolean);
        }
        if (!Array.isArray(parsed)) throw new Error("invalid list response");
        const items = (parsed as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
          .map((text) => ({ id: newId(), text, checked: false }));
        if (items.length === 0) throw new Error("no items extracted");
        newBlock = { id: newId(), type: "checklist", items };
        extractedCount = items.length;
      }

      // 4) char budget — truncate to fit
      let cost = estimateBlockChars(newBlock);
      if (cost > remaining) {
        if (newBlock.type === "checklist") {
          let acc = 0;
          const trimmed: typeof newBlock.items = [];
          for (const it of newBlock.items) {
            if (acc + it.text.length > remaining) break;
            acc += it.text.length;
            trimmed.push(it);
          }
          newBlock = { ...newBlock, items: trimmed };
        } else if (newBlock.type === "text") {
          // crude truncate by character budget on raw html
          newBlock = { ...newBlock, html: newBlock.html.slice(0, Math.max(0, remaining * 2)) };
        }
        cost = estimateBlockChars(newBlock);
        if (cost === 0) {
          toast.warning("Note trimmed due to the global 2000-character limit.");
          return;
        }
        toast.warning("Note trimmed due to the global 2000-character limit.");
      }

      // 5) insert
      insertBlockAfter(block.id, newBlock);

      // 6) fire-and-forget ocr_text meta sync
      const persistId = noteIdRef.current;
      if (persistId) {
        const ocrText =
          newBlock.type === "checklist"
            ? newBlock.items.map((i) => i.text).join("\n")
            : stripHtml((newBlock as Extract<NoteBlock, { type: "text" }>).html);
        const prevMeta =
          (existing?.image_metadata as Record<string, unknown> | null) ?? {};
        const prevOcr = Array.isArray((prevMeta as { ocr_text?: unknown }).ocr_text)
          ? ((prevMeta as { ocr_text: unknown[] }).ocr_text as unknown[])
          : [];
        void supabase
          .from("notes")
          .update({
            image_metadata: {
              ...prevMeta,
              ocr_text: [
                ...prevOcr,
                { block_id: block.id, text: ocrText, at: new Date().toISOString() },
              ],
            } as never,
          })
          .eq("id", persistId);
      }

      toast.success(
        `MediNist AI extracted ${extractedCount} item${extractedCount === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.error("[medinist-ai-notepad] ocr failed:", err);
      toast.error("MediNist AI Engine is currently busy. Please try again.");
    } finally {
      setScanningBlockId(null);
    }
  };

  // ---- AI Text Assistant (live) ----
  const handleAIAction = async (action: AIAction) => {
    setAiSheetOpen(false);
    const latest = draftRef.current;
    const firstTextIdx = latest.content.findIndex((b) => b.type === "text");
    const allText = latest.content
      .filter((b): b is Extract<NoteBlock, { type: "text" }> => b.type === "text")
      .map((b) => stripHtml(b.html))
      .filter(Boolean)
      .join("\n");

    if (!allText) {
      toast.error("Please type something first before using the AI Assistant.");
      return;
    }

    setAiProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "medinist-ai-notepad",
        { body: { mode: "assistant", payload: { text: allText, actionId: action } } },
      );
      if (error) throw error;
      const result: string = data?.result ?? "";
      if (!result) throw new Error("empty AI response");

      if (action === "smart_clean" || action === "translate_en") {
        // measure the would-be replacement cost: total - currentFirstText + newPlain
        const currentFirstLen =
          firstTextIdx >= 0 && latest.content[firstTextIdx].type === "text"
            ? stripHtml(
                (latest.content[firstTextIdx] as Extract<NoteBlock, { type: "text" }>).html,
              ).length
            : 0;
        const newPlainLen = stripHtml(result).length;
        const projected = totalChars - currentFirstLen + newPlainLen;
        let html = result;
        if (projected > MAX_CHARS) {
          const allowed = Math.max(0, MAX_CHARS - (totalChars - currentFirstLen));
          html = result.slice(0, Math.max(0, allowed * 2));
          toast.warning("Note trimmed due to the global 2000-character limit.");
        }
        replaceFirstTextBlock(firstTextIdx, html);
      } else if (action === "extract_actions") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(result);
        } catch {
          parsed = result
            .split("\n")
            .map((s) => s.replace(/^[-*\d.\s]+/, "").trim())
            .filter(Boolean);
        }
        if (!Array.isArray(parsed)) throw new Error("invalid actions response");
        let items = (parsed as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
          .map((text) => ({ id: newId(), text, checked: false }));
        if (items.length === 0) {
          toast.info("MediNist AI didn't find any action items");
          return;
        }
        let block: NoteBlock = { id: newId(), type: "checklist", items };
        if (estimateBlockChars(block) > remaining) {
          let acc = 0;
          const trimmed: typeof items = [];
          for (const it of items) {
            if (acc + it.text.length > remaining) break;
            acc += it.text.length;
            trimmed.push(it);
          }
          if (trimmed.length === 0) {
            toast.warning("Note trimmed due to the global 2000-character limit.");
            return;
          }
          items = trimmed;
          block = { id: newId(), type: "checklist", items };
          toast.warning("Note trimmed due to the global 2000-character limit.");
        }
        const lastTextId = [...latest.content]
          .reverse()
          .find((b) => b.type === "text")?.id;
        if (lastTextId) insertBlockAfter(lastTextId, block);
        else addBlockWithCursor(block);
      }

      toast.success("Note optimized by MediNist AI");
    } catch (err) {
      console.error("[medinist-ai-notepad] assistant failed:", err);
      toast.error("MediNist AI Engine is currently busy. Please try again.");
    } finally {
      setAiProcessing(false);
    }
  };

  const replaceFirstTextBlock = (idx: number, html: string) => {
    setDraft((d) => {
      const next = [...d.content];
      if (idx === -1) {
        next.unshift({ id: newId(), type: "text", html });
      } else {
        const existing = next[idx];
        if (existing.type === "text") next[idx] = { ...existing, html };
      }
      // Enforce ceiling
      let total = d.title.length;
      for (const b of next) {
        if (b.type === "text") total += b.html.replace(/<[^>]*>/g, "").length;
        else if (b.type === "checklist")
          total += b.items.reduce((s, it) => s + it.text.length, 0);
      }
      if (total > MAX_CHARS) {
        toast.warning("Approaching 2000 character limit");
      }
      return { ...d, content: next };
    });
  };

  // ---- text editing exec ----
  const exec = (cmd: string, value?: string) => {
    // Apply formatting to whichever text block currently has focus; fall
    // back to the first text block if none does.
    let activeId: string | null = null;
    for (const [bid, handle] of blockRefs.current.entries()) {
      if (handle.el() === document.activeElement) {
        activeId = bid;
        break;
      }
    }
    if (!activeId) {
      const firstText = draft.content.find((b) => b.type === "text");
      activeId = firstText?.id ?? null;
    }
    const el = activeId ? blockRefs.current.get(activeId)?.el() ?? null : null;
    if (el && document.activeElement !== el) el.focus();
    try {
      document.execCommand(cmd, false, value);
    } catch {
      // ignore
    }
    if (el && activeId) {
      updateBlock(activeId, { html: el.innerHTML });
    }
  };

  return (
    <div className={cn("min-h-screen w-full bg-white")}>
      {/* Top bar — glassmorphic */}
      <header
        className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100/80 px-3 py-2.5 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="p-2 rounded-full hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft size={20} />
        </button>
        {/* Silent background sync — no status text */}
        <div className="flex-1" />
        {readOnly && (
          <span className="text-xs text-slate-500">Read only</span>
        )}
        {uploading && <Loader2 size={16} className="animate-spin text-slate-400" />}
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
        className="min-h-screen overflow-y-auto"
        bottomPadding={120}
      >
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-32 flex flex-col gap-1">
        {/* Title */}
        <input
          type="text"
          value={draft.title}
          onChange={(e) => {
            const v = e.target.value;
            const prev = draft.title;
            const delta = v.length - prev.length;
            if (delta > remaining) return;
            setDraft((d) => ({ ...d, title: v }));
          }}
          placeholder="Title"
          readOnly={readOnly}
          className="w-full text-2xl font-bold tracking-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-300 text-slate-900 px-0 pb-4"
        />

        {draft.reminder_at && (
          <ReminderBadge
            iso={draft.reminder_at}
            onClear={() => setDraft((d) => ({ ...d, reminder_at: null }))}
          />
        )}

        {/* Document flow — every block (text, image, checklist) sits in
            a single ordered column with a tight 4 px gap. */}
        {draft.content.map((block, idx) => (
          <div key={block.id} className="relative group">
            {block.type === "text" && (
              <BlockText
                ref={(h) => {
                  if (h) blockRefs.current.set(block.id, h);
                  else blockRefs.current.delete(block.id);
                }}
                html={block.html}
                readOnly={readOnly}
                placeholder={idx === 0 ? "Note" : ""}
                maxRemaining={remaining}
                onChange={(html) => updateBlock(block.id, { html })}
                onMentionChange={(s) =>
                  setMention(
                    s ? { ...s, ctx: { kind: "text", blockId: block.id } } : null,
                  )
                }
              />
            )}
            {block.type === "checklist" && (
              <BlockChecklist
                ref={(h) => {
                  if (h) checklistRefs.current.set(block.id, h);
                  else checklistRefs.current.delete(block.id);
                }}
                items={block.items}
                readOnly={readOnly}
                maxRemaining={remaining}
                onChange={(items) => updateBlock(block.id, { items })}
                onMentionChange={(s) =>
                  setMention(
                    s
                      ? {
                          query: s.query,
                          position: s.position,
                          ctx: { kind: "checklist", blockId: block.id, itemIndex: s.itemIndex },
                        }
                      : null,
                  )
                }
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
                onScan={() => handleScanImage(block)}
                scanning={scanningBlockId === block.id}
              />
            )}
            {!readOnly && block.type !== "text" && (
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

        <div aria-hidden="true" className="h-[50vh] shrink-0" />
        </div>
      </KeyboardAvoidingScroll>

      {/* Floating character counter — fixed above the keyboard toolbar */}
      {!readOnly && (
        <div
          aria-live="polite"
          className="fixed right-4 bottom-[88px] z-30 pointer-events-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <span
            className={cn(
              "text-[10px] font-mono font-medium tracking-wider",
              "bg-slate-50/80 backdrop-blur px-2 py-0.5 rounded-md border border-slate-100",
              totalChars >= NEAR_LIMIT ? "text-rose-500" : "text-slate-400",
            )}
          >
            {totalChars}/{MAX_CHARS}
          </span>
        </div>
      )}

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
          onOpenAI={() => setAiSheetOpen(true)}
          onOpenReminder={() => setReminderOpen(true)}
        />
      )}

      <AIActionSheet open={aiSheetOpen} onOpenChange={setAiSheetOpen} onAction={handleAIAction} />
      <AIProgressPill show={aiProcessing} />

      <ReminderDrawer
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        currentIso={draft.reminder_at}
        onSave={(iso) => {
          setDraft((d) => ({ ...d, reminder_at: iso }));
          setReminderOpen(false);
          toast.success("Reminder set");
        }}
        onClear={() => {
          setDraft((d) => ({ ...d, reminder_at: null }));
          setReminderOpen(false);
          toast.success("Reminder cleared");
        }}
      />

      <MentionPopover
        query={mention?.query ?? ""}
        members={members}
        position={mention?.position ?? null}
        activeIndex={mentionIndex}
        onActiveChange={setMentionIndex}
        onPick={handlePickMention}
        onClose={() => setMention(null)}
      />
    </div>
  );
};

export default NoteEditor;