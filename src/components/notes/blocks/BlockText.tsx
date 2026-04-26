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

    useImperativeHandle(ref, () => ({
      focus: () => innerRef.current?.focus(),
      el: () => innerRef.current,
    }));

    useEffect(() => {
      if (innerRef.current && innerRef.current.innerHTML !== html) {
        innerRef.current.innerHTML = html || "";
      }
    }, [html]);

    return (
      <div
        ref={innerRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={(e) => onChange?.((e.target as HTMLDivElement).innerHTML)}
        onFocus={onFocus}
        data-placeholder={placeholder}
        className="empty-placeholder min-h-[160px] w-full bg-transparent text-base text-gray-800 leading-relaxed focus:outline-none prose prose-sm max-w-none"
      />
    );
  },
);

BlockText.displayName = "BlockText";

export default BlockText;