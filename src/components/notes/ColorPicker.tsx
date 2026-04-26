import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteColor } from "@/hooks/useNotes";

// Theme-based subtle shades — soft, professional, easy on the eyes.
// We map each NoteColor key to an explicit hex so the palette stays
// consistent regardless of Tailwind's default scale.
export const NOTE_COLORS: {
  key: NoteColor;
  hex: string;
  ring: string;
  label: string;
}[] = [
  { key: "default", hex: "#ffffff", ring: "ring-gray-300", label: "Default" },
  { key: "green", hex: "#e8f5e9", ring: "ring-emerald-300", label: "Soft Mint" },
  { key: "blue", hex: "#e3f2fd", ring: "ring-sky-300", label: "Pale Blue" },
  { key: "purple", hex: "#f3e5f5", ring: "ring-violet-300", label: "Lavender" },
  { key: "yellow", hex: "#fff8e1", ring: "ring-amber-300", label: "Light Sand" },
  { key: "pink", hex: "#fce4ec", ring: "ring-pink-300", label: "Blush" },
  { key: "red", hex: "#ffebee", ring: "ring-red-300", label: "Soft Coral" },
];

export function colorHex(color: NoteColor): string {
  return NOTE_COLORS.find((c) => c.key === color)?.hex ?? "#ffffff";
}

/** @deprecated kept for backwards compatibility — returns empty string. */
export function colorBg(_color: NoteColor): string {
  return "";
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
          style={{ backgroundColor: c.hex }}
          className={cn(
            "h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center transition",
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