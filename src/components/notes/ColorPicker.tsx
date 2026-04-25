import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteColor } from "@/hooks/useNotes";

export const NOTE_COLORS: { key: NoteColor; bg: string; ring: string; label: string }[] = [
  { key: "default", bg: "bg-white", ring: "ring-gray-300", label: "Default" },
  { key: "red", bg: "bg-red-50", ring: "ring-red-300", label: "Urgent" },
  { key: "yellow", bg: "bg-amber-50", ring: "ring-amber-300", label: "Warning" },
  { key: "green", bg: "bg-emerald-50", ring: "ring-emerald-300", label: "Done" },
  { key: "blue", bg: "bg-sky-50", ring: "ring-sky-300", label: "Info" },
  { key: "purple", bg: "bg-violet-50", ring: "ring-violet-300", label: "Note" },
  { key: "pink", bg: "bg-pink-50", ring: "ring-pink-300", label: "Personal" },
];

export function colorBg(color: NoteColor): string {
  return NOTE_COLORS.find((c) => c.key === color)?.bg ?? "bg-white";
}

interface ColorPickerProps {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
}

const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {NOTE_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          aria-label={c.label}
          className={cn(
            "h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center transition",
            c.bg,
            value === c.key && "ring-2 ring-offset-2",
            value === c.key && c.ring,
          )}
        >
          {value === c.key && <Check size={14} className="text-gray-700" />}
        </button>
      ))}
    </div>
  );
};

export default ColorPicker;