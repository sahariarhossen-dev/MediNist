import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import DOMPurify from "dompurify";

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
}

export interface BlockTextHandle {
  focus: () => void;
  el: () => HTMLDivElement | null;
}

const BlockText = forwardRef<BlockTextHandle, BlockTextProps>(
  ({ html, readOnly, placeholder = "Note", onChange, onFocus, maxRemaining }, ref) => {
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
    }));

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      // Only sync from props when the incoming html differs from
      // both the live DOM AND the last value we set. This means
      // local user edits do not trigger a re-set, preserving caret.
      const next = DOMPurify.sanitize(html || "", { USE_PROFILES: { html: true } });
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
        }}
        onFocus={onFocus}
        data-placeholder={placeholder}
        className="empty-placeholder min-h-[24px] w-full bg-transparent text-base text-gray-800 leading-relaxed focus:outline-none prose prose-sm max-w-none"
      />
    );
  },
);

BlockText.displayName = "BlockText";

export default BlockText;