import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import type { MentionTriggerState } from "@/components/notes/blocks/BlockText";

interface ChecklistItem {
  id?: string;
  text: string;
  checked: boolean;
}

interface BlockChecklistProps {
  items: ChecklistItem[];
  readOnly?: boolean;
  onChange?: (items: ChecklistItem[]) => void;
  /** Max additional characters permitted across all items. */
  maxRemaining?: number;
  onMentionChange?: (
    state: (MentionTriggerState & { itemIndex: number }) | null,
  ) => void;
  onItemFocus?: (itemIndex: number) => void;
}

export interface BlockChecklistHandle {
  insertMention: (itemIndex: number, name: string) => void;
}

const newItemId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const BlockChecklist = forwardRef<BlockChecklistHandle, BlockChecklistProps>(
  ({ items, readOnly, onChange, maxRemaining, onMentionChange, onItemFocus }, ref) => {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const focusIndexRef = useRef<number | null>(null);

  // Backfill stable ids for items loaded from older notes so React can key
  // rows by id (prevents the "duplicating / disappearing checkbox" glitch
  // caused by index-based keys when inserting mid-list).
  useEffect(() => {
    if (!onChange) return;
    if (items.some((it) => !it.id)) {
      onChange(items.map((it) => (it.id ? it : { ...it, id: newItemId() })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const update = (i: number, patch: Partial<ChecklistItem>) => {
    if (typeof maxRemaining === "number" && typeof patch.text === "string") {
      const prevLen = items[i]?.text.length ?? 0;
      const delta = patch.text.length - prevLen;
      if (delta > maxRemaining) return;
    }
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange?.(next);
  };

  const remove = (i: number) => {
    onChange?.(items.filter((_, idx) => idx !== i));
  };

  const add = () => {
    onChange?.([...items, { id: newItemId(), text: "", checked: false }]);
  };

  const insertAfter = (i: number) => {
    const next = [
      ...items.slice(0, i + 1),
      { id: newItemId(), text: "", checked: false },
      ...items.slice(i + 1),
    ];
    focusIndexRef.current = i + 1;
    onChange?.(next);
    // focus on the newly inserted row after re-render
    requestAnimationFrame(() => {
      const idx = focusIndexRef.current;
      if (idx != null) inputsRef.current[idx]?.focus();
      focusIndexRef.current = null;
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      insertAfter(i);
    } else if (e.key === "Backspace" && items[i].text === "" && items.length > 1) {
      e.preventDefault();
      const prev = i - 1;
      remove(i);
      requestAnimationFrame(() => {
        if (prev >= 0) inputsRef.current[prev]?.focus();
      });
    }
  };

  const detectMention = (i: number) => {
    if (!onMentionChange) return;
    const input = inputsRef.current[i];
    if (!input) return onMentionChange(null);
    const caret = input.selectionStart ?? input.value.length;
    const text = input.value;
    let j = caret - 1;
    while (j >= 0 && !/\s/.test(text[j]) && text[j] !== "@") j--;
    if (j < 0 || text[j] !== "@") return onMentionChange(null);
    if (j > 0 && !/\s/.test(text[j - 1])) return onMentionChange(null);
    const query = text.slice(j + 1, caret);
    if (query.length > 30) return onMentionChange(null);
    const rect = input.getBoundingClientRect();
    // approximate caret x using a measured char width
    const charW = 7;
    const left = rect.left + 8 + caret * charW;
    onMentionChange({
      query,
      position: { top: rect.top, left: Math.min(left, rect.right) },
      itemIndex: i,
    });
  };

  useImperativeHandle(ref, () => ({
    insertMention: (itemIndex, name) => {
      const input = inputsRef.current[itemIndex];
      if (!input) return;
      const text = input.value;
      const caret = input.selectionStart ?? text.length;
      let j = caret - 1;
      while (j >= 0 && !/\s/.test(text[j]) && text[j] !== "@") j--;
      if (j < 0 || text[j] !== "@") return;
      const insert = `@${name} `;
      const nextText = text.slice(0, j) + insert + text.slice(caret);
      update(itemIndex, { text: nextText });
      const newCaret = j + insert.length;
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(newCaret, newCaret);
      });
      onMentionChange?.(null);
    },
  }));

  return (
    <div className="space-y-1 bg-white/70 rounded-md border border-gray-200 px-2 py-2 mb-0 mt-0 pt-[8px] pb-[8px]">
      {items.map((it, i) => (
        <div key={it.id ?? `idx-${i}`} className="flex items-center gap-2">
          <Checkbox
            checked={it.checked}
            onCheckedChange={(v) => update(i, { checked: !!v })}
            disabled={readOnly}
          />
          {readOnly ? (
            <span
              className={`flex-1 text-sm ${it.checked ? "line-through text-gray-400" : "text-gray-800"}`}
            >
              {it.text || <span className="text-gray-400">Empty item</span>}
            </span>
          ) : (
            <Input
              ref={(el) => (inputsRef.current[i] = el)}
              value={it.text}
              onChange={(e) => {
                update(i, { text: e.target.value });
                requestAnimationFrame(() => detectMention(i));
              }}
              onKeyUp={() => detectMention(i)}
              onFocus={() => onItemFocus?.(i)}
              onBlur={() => onMentionChange?.(null)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              placeholder="List item"
              className={`h-8 flex-1 ${it.checked ? "line-through text-gray-400" : ""}`}
            />
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-1 text-gray-400 hover:text-red-500"
              aria-label="Remove item"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8"
        >
          <Plus size={14} className="mr-1" /> Add item
        </Button>
      )}
    </div>
  );
  },
);
BlockChecklist.displayName = "BlockChecklist";

export default BlockChecklist;