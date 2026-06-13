import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import DOMPurify from "dompurify";

export interface MentionTriggerState {
  query: string;
  position: { top: number; left: number };
}

interface BlockTextProps {
  html: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: (html: string) => void;
  onFocus?: () => void;
  /**
   * Maximum number of additional plain-text characters this block may
   * accept on top of its current content. When the user tries to type
   * past it, the input is reverted and the caret is placed at the end.
   */
  maxRemaining?: number;
  /**
   * Notifies parent of a live `@query` token at the caret, or null when
   * none is active. Used to drive the MentionPopover.
   */
  onMentionChange?: (state: MentionTriggerState | null) => void;
}

export interface BlockTextHandle {
  focus: () => void;
  el: () => HTMLDivElement | null;
  /** Replaces the active `@query` token at the caret with a styled mention chip. */
  insertMention: (member: { user_id: string; name: string }) => void;
}

const BlockText = forwardRef<BlockTextHandle, BlockTextProps>(
  ({ html, readOnly, placeholder = "Note", onChange, onFocus, maxRemaining, onMentionChange }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    // Track the last HTML we wrote into the DOM ourselves so we don't
    // overwrite the live contenteditable while the user is typing
    // (which collapses the caret to position 0).
    const lastSetHtmlRef = useRef<string>("");
    // Track the last accepted plain-text length so we can revert when
    // the user blows past the global character budget.
    const lastAcceptedHtmlRef = useRef<string>(html || "");

    useImperativeHandle(ref, () => ({
      focus: () => innerRef.current?.focus(),
      el: () => innerRef.current,
      insertMention: (member) => {
        const el = innerRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        // Walk back to find the `@` in the current text node
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return;
        const text = node.textContent ?? "";
        const caret = range.startOffset;
        let i = caret - 1;
        while (i >= 0 && text[i] !== "@" && !/\s/.test(text[i])) i--;
        if (i < 0 || text[i] !== "@") return;
        const delRange = document.createRange();
        delRange.setStart(node, i);
        delRange.setEnd(node, caret);
        delRange.deleteContents();
        const chip = document.createElement("span");
        chip.className = "mention";
        chip.setAttribute("data-user-id", member.user_id);
        chip.setAttribute("contenteditable", "false");
        chip.textContent = `@${member.name}`;
        delRange.insertNode(chip);
        const space = document.createTextNode("\u00A0");
        chip.after(space);
        // Move caret after space
        const after = document.createRange();
        after.setStartAfter(space);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
        const next = el.innerHTML;
        lastSetHtmlRef.current = next;
        lastAcceptedHtmlRef.current = next;
        onChange?.(next);
        onMentionChange?.(null);
      },
    }));

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      // Only sync from props when the incoming html differs from
      // both the live DOM AND the last value we set. This means
      // local user edits do not trigger a re-set, preserving caret.
      const next = DOMPurify.sanitize(html || "", {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["data-user-id", "contenteditable"],
      });
      if (el.innerHTML === next) return;
      if (lastSetHtmlRef.current === next) return;
      el.innerHTML = next;
      lastSetHtmlRef.current = next;
      lastAcceptedHtmlRef.current = next;
    }, [html]);

    const placeCaretAtEnd = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    };

    const detectMention = () => {
      if (!onMentionChange) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return onMentionChange(null);
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return onMentionChange(null);
      const text = node.textContent ?? "";
      const caret = range.startOffset;
      let i = caret - 1;
      while (i >= 0 && !/\s/.test(text[i]) && text[i] !== "@") i--;
      if (i < 0 || text[i] !== "@") return onMentionChange(null);
      // Must be at start or preceded by whitespace
      if (i > 0 && !/\s/.test(text[i - 1])) return onMentionChange(null);
      const query = text.slice(i + 1, caret);
      if (query.length > 30) return onMentionChange(null);
      const rect = range.getBoundingClientRect();
      onMentionChange({
        query,
        position: { top: rect.top, left: rect.left },
      });
    };

    return (
      <div
        ref={innerRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={(e) => {
          const target = e.target as HTMLDivElement;
          const next = target.innerHTML;
          // Hard character limit guard
          if (typeof maxRemaining === "number") {
            const prevText = lastAcceptedHtmlRef.current.replace(/<[^>]*>/g, "");
            const nextText = next.replace(/<[^>]*>/g, "");
            const delta = nextText.length - prevText.length;
            if (delta > maxRemaining) {
              target.innerHTML = lastAcceptedHtmlRef.current;
              lastSetHtmlRef.current = lastAcceptedHtmlRef.current;
              placeCaretAtEnd(target);
              return;
            }
          }
          lastSetHtmlRef.current = next;
          lastAcceptedHtmlRef.current = next;
          onChange?.(next);
          detectMention();
        }}
        onKeyUp={() => detectMention()}
        onBlur={() => onMentionChange?.(null)}
        onFocus={onFocus}
        data-placeholder={placeholder}
        className="empty-placeholder min-h-[24px] w-full bg-transparent text-base text-gray-800 leading-relaxed focus:outline-none prose prose-sm max-w-none"
      />
    );
  },
);

BlockText.displayName = "BlockText";

export default BlockText;