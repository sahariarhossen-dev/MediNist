import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import AIActionSheet, { type AIAction } from "@/components/notes/AIActionSheet";
import AIProgressPill from "@/components/notes/AIProgressPill";
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
  const [scanningBlockId, setScanningBlockId] = useState<string | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
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
    };
  };

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

  // ---- AI OCR (mock) ----
  const handleScanImage = async (
    block: Extract<NoteBlock, { type: "image" }>,
  ) => {
    if (scanningBlockId) return;
    setScanningBlockId(block.id);
    await new Promise((r) => setTimeout(r, 2000));

    let newBlock: NoteBlock;
    let extractedCount = 0;
    if (block.category === "invoice") {
      newBlock = {
        id: newId(),
        type: "text",
        html:
          '<p><strong>Supplier:</strong> ACME Pharma Ltd.</p>' +
          '<p><strong>Invoice #:</strong> INV-2026-00481 · <strong>Date:</strong> 13 Jun 2026</p>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:6px 0">' +
          '<thead><tr><th style="text-align:left;border-bottom:1px solid #e5e7eb;padding:4px">Item</th><th style="text-align:right;border-bottom:1px solid #e5e7eb;padding:4px">Qty</th><th style="text-align:right;border-bottom:1px solid #e5e7eb;padding:4px">Amount</th></tr></thead>' +
          '<tbody>' +
          '<tr><td style="padding:4px">Napa Extend 650mg</td><td style="text-align:right;padding:4px">2</td><td style="text-align:right;padding:4px">৳ 240</td></tr>' +
          '<tr><td style="padding:4px">Sergel 20mg</td><td style="text-align:right;padding:4px">5</td><td style="text-align:right;padding:4px">৳ 600</td></tr>' +
          '<tr><td style="padding:4px">Seclo 20mg</td><td style="text-align:right;padding:4px">3</td><td style="text-align:right;padding:4px">৳ 400</td></tr>' +
          '</tbody></table>' +
          '<p><strong>Total:</strong> ৳ 1,240</p>',
      };
      extractedCount = 3;
    } else {
      const items = [
        { id: newId(), text: "Napa Extend 665mg — 2 Boxes", checked: false },
        { id: newId(), text: "Sergel 20mg — 1 Strip", checked: false },
        { id: newId(), text: "Monas 10mg — 1 Box", checked: false },
        { id: newId(), text: "Seclo 20mg — 2 Strips", checked: false },
      ];
      newBlock = { id: newId(), type: "checklist", items };
      extractedCount = items.length;
    }

    const cost = estimateBlockChars(newBlock);
    if (cost > remaining) {
      setScanningBlockId(null);
      toast.warning("Not enough space — approaching 2000 character limit");
      return;
    }

    insertBlockAfter(block.id, newBlock);
    setScanningBlockId(null);
    toast.success(`MediNist AI extracted ${extractedCount} item${extractedCount > 1 ? "s" : ""}`);
  };

  // ---- AI Text Assistant (mock) ----
  const stripHtml = (h: string) => h.replace(/<[^>]*>/g, "").trim();

  const banglaDict: Array<[RegExp, string]> = [
    [/রফিক ভাই/g, "Rofik Bhai"],
    [/ভাই/g, "Bhai"],
    [/সকালে/g, "in the morning"],
    [/কালকে/g, "tomorrow"],
    [/এসে/g, "will come and"],
    [/দেবে/g, "pay"],
    [/দিবে/g, "will give"],
    [/নিবে/g, "will take"],
    [/আনবে/g, "will bring"],
    [/নিছে/g, "took"],
    [/টাকা দেয় নাই/g, "has not paid"],
    [/টাকা/g, "money"],
    [/নাপা/g, "Napa"],
    [/সার্জেল/g, "Sergel"],
    [/পিস/g, "pcs"],
    [/বক্স/g, "box"],
    [/স্ট্রিপ/g, "strip"],
    [/[০-৯]/g, (d: string) => String("০১২৩৪৫৬৭৮৯".indexOf(d))],
  ];

  const translateBangla = (text: string) =>
    text
      .split("\n")
      .map((line) => {
        let out = line;
        let touched = false;
        for (const [re, rep] of banglaDict) {
          if (re.test(out)) {
            touched = true;
            out = out.replace(re, rep as string);
          }
        }
        return touched || !/[\u0980-\u09FF]/.test(line) ? out : `[EN] ${line}`;
      })
      .join("\n");

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
      toast.info("Add some text first for the AI to work on");
      return;
    }

    setAiProcessing(true);
    await new Promise((r) => setTimeout(r, 1400));

    if (action === "smart_clean") {
      const isBanglaShopNote =
        /[\u0980-\u09FF]/.test(allText) || /rofik|napa|taka/i.test(allText);
      const html = isBanglaShopNote
        ? '<p><strong>Customer:</strong> Rofik Bhai</p>' +
          '<p><strong>Medicine:</strong> Napa - 10 Pcs</p>' +
          '<p><strong>Status:</strong> ❌ Unpaid (Will pay tomorrow)</p>'
        : (() => {
            const lines = allText.split("\n").filter(Boolean);
            const summary = lines[0] ?? "";
            const details = lines.slice(1).join(" · ");
            return (
              `<p><strong>Summary:</strong> ${summary}</p>` +
              (details ? `<p><strong>Details:</strong> ${details}</p>` : "") +
              `<p><strong>Status:</strong> ✅ Logged</p>`
            );
          })();
      replaceFirstTextBlock(firstTextIdx, html);
    } else if (action === "translate_en") {
      const translated = translateBangla(allText);
      const html = translated
        .split("\n")
        .map((l) => `<p>${l || "<br>"}</p>`)
        .join("");
      replaceFirstTextBlock(firstTextIdx, html);
    } else if (action === "extract_actions") {
      const verbRe = /\b(call|order|pay|deliver|check|follow up|buy|send|return)\b|নিবে|দিবে|আনবে|দেবে/i;
      const sentences = allText
        .split(/[\n.।!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && verbRe.test(s));
      const items =
        sentences.length > 0
          ? sentences.slice(0, 8).map((s) => ({ id: newId(), text: s, checked: false }))
          : [
              { id: newId(), text: "Follow up with customer", checked: false },
              { id: newId(), text: "Check stock for pending order", checked: false },
            ];
      const block: NoteBlock = { id: newId(), type: "checklist", items };
      const cost = estimateBlockChars(block);
      if (cost > remaining) {
        setAiProcessing(false);
        toast.warning("Approaching 2000 character limit");
        return;
      }
      const lastTextId = [...latest.content].reverse().find((b) => b.type === "text")?.id;
      if (lastTextId) insertBlockAfter(lastTextId, block);
      else addBlockWithCursor(block);
    }

    setAiProcessing(false);
    toast.success("Note optimized by MediNist AI");
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
    <div
      className={cn("min-h-screen w-full max-w-3xl mx-auto")}
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
        className="min-h-screen overflow-y-auto px-4 pt-4 flex flex-col gap-1"
        bottomPadding={120}
      >
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
          className="w-full text-2xl font-semibold bg-transparent border-0 outline-none placeholder:text-gray-400 text-gray-900 mb-2"
        />

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
              />
            )}
            {block.type === "checklist" && (
              <BlockChecklist
                items={block.items}
                readOnly={readOnly}
                maxRemaining={remaining}
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

        {/* Safe-zone counter sits after content, before the infinite spacer. */}
        {!readOnly && (
          <div className="pointer-events-none flex justify-end pt-2">
            <span
              className={cn(
                "text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-white/60 backdrop-blur-sm",
                totalChars >= NEAR_LIMIT ? "text-red-500" : "text-gray-400",
              )}
            >
              {totalChars}/{MAX_CHARS}
            </span>
          </div>
        )}

        <div aria-hidden="true" className="h-[50vh] shrink-0" />
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