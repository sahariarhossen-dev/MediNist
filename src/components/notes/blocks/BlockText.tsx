import { useEffect, useRef } from "react";
import { Bold, Italic, List } from "lucide-react";

interface BlockTextProps {
  html: string;
  readOnly?: boolean;
  onChange?: (html: string) => void;
  onRemove?: () => void;
}

const BlockText = ({ html, readOnly, onChange }: BlockTextProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html || "";
    }
  }, [html]);

  const exec = (cmd: string) => {
    document.execCommand(cmd, false);
    if (ref.current) onChange?.(ref.current.innerHTML);
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex gap-1 border border-gray-200 rounded-md p-1 bg-white w-fit">
          <button
            type="button"
            onClick={() => exec("bold")}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onClick={() => exec("italic")}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onClick={() => exec("insertUnorderedList")}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="Bulleted list"
          >
            <List size={14} />
          </button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={(e) => onChange?.((e.target as HTMLDivElement).innerHTML)}
        className="min-h-[60px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 prose prose-sm max-w-none"
        data-placeholder="Type something..."
      />
    </div>
  );
};

export default BlockText;