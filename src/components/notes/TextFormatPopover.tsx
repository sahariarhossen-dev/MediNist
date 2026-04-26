import { Bold, Italic, Underline, Heading1, Heading2 } from "lucide-react";

interface Props {
  /** Run an execCommand on the currently-focused editable surface. */
  exec: (cmd: string, value?: string) => void;
}

const btn =
  "h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-700";

const TextFormatPopover = ({ exec }: Props) => {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} aria-label="Bold">
        <Bold size={16} />
      </button>
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} aria-label="Italic">
        <Italic size={16} />
      </button>
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} aria-label="Underline">
        <Underline size={16} />
      </button>
      <div className="h-6 w-px bg-gray-200 mx-1" />
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("formatBlock", "H1")} aria-label="Heading 1">
        <Heading1 size={16} />
      </button>
      <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("formatBlock", "H2")} aria-label="Heading 2">
        <Heading2 size={16} />
      </button>
    </div>
  );
};

export default TextFormatPopover;