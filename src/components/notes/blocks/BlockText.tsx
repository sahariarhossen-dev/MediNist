import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface BlockTextProps {
  html: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: (html: string) => void;
  onFocus?: () => void;
}

export interface BlockTextHandle {
  focus: () => void;
  el: () => HTMLDivElement | null;
}

const BlockText = forwardRef<BlockTextHandle, BlockTextProps>(
  ({ html, readOnly, placeholder = "Note", onChange, onFocus }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    // Track the last HTML we wrote into the DOM ourselves so we don't
    // overwrite the live contenteditable while the user is typing
    // (which collapses the caret to position 0).
    const lastSetHtmlRef = useRef<string>("");

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
      const next = html || "";
      if (el.innerHTML === next) return;
      if (lastSetHtmlRef.current === next) return;
      el.innerHTML = next;
      lastSetHtmlRef.current = next;
    }, [html]);

    return (
      <div
        ref={innerRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={(e) => {
          const next = (e.target as HTMLDivElement).innerHTML;
          lastSetHtmlRef.current = next;
          onChange?.(next);
        }}
        onFocus={onFocus}
        data-placeholder={placeholder}
        className="empty-placeholder min-h-[160px] w-full bg-transparent text-base text-gray-800 leading-relaxed focus:outline-none prose prose-sm max-w-none"
      />
    );
  },
);

BlockText.displayName = "BlockText";

export default BlockText;