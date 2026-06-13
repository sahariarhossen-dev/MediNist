import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteColor } from "@/hooks/useNotes";

// Premium adaptive tints — crisp white base with ultra-subtle 5-10% color washes.
// Used as Tailwind classes (so dark-mode variants Just Work) on note cards and
// the editor canvas. The legacy `colorHex` helper now returns a near-white
// swatch for the picker chips only — no longer used for card backgrounds.
export const NOTE_COLORS: {
  key: NoteColor;
  hex: string; // swatch color for the picker UI only
  tint: string; // Tailwind classes applied to cards / editor surface
  ring: string;
  label: string;
}[] = [
  { key: "default", hex: "#ffffff", tint: "bg-white dark:bg-slate-900", ring: "ring-slate-300", label: "Default" },
  { key: "green",   hex: "#ecfdf5", tint: "bg-emerald-50/40 dark:bg-emerald-950/20", ring: "ring-emerald-300", label: "Mint" },
  { key: "blue",    hex: "#eef2ff", tint: "bg-indigo-50/40 dark:bg-indigo-950/20",  ring: "ring-indigo-300", label: "Indigo" },
  { key: "purple",  hex: "#faf5ff", tint: "bg-purple-50/40 dark:bg-purple-950/20",  ring: "ring-purple-300", label: "Lavender" },
  { key: "yellow",  hex: "#fffbeb", tint: "bg-amber-50/40 dark:bg-amber-950/20",    ring: "ring-amber-300",  label: "Sand" },
  { key: "pink",    hex: "#fff1f2", tint: "bg-rose-50/40 dark:bg-rose-950/20",      ring: "ring-rose-300",   label: "Blush" },
  { key: "red",     hex: "#fff1f2", tint: "bg-rose-50/40 dark:bg-rose-950/20",      ring: "ring-rose-300",   label: "Coral" },
];

export function colorHex(color: NoteColor): string {
  return NOTE_COLORS.find((c) => c.key === color)?.hex ?? "#ffffff";
}

/** Returns the Tailwind classes for the premium tinted surface. */
export function colorClasses(color: NoteColor): string {
  return NOTE_COLORS.find((c) => c.key === color)?.tint ?? "bg-white dark:bg-slate-900";
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