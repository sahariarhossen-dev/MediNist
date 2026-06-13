import { useEffect, useRef } from "react";
import type { PharmacyMember } from "@/hooks/useNotes";

interface Props {
  query: string;
  members: PharmacyMember[];
  position: { top: number; left: number } | null;
  activeIndex: number;
  onPick: (m: PharmacyMember) => void;
  onActiveChange: (i: number) => void;
  onClose: () => void;
}

export function filterMembers(members: PharmacyMember[], query: string) {
  const q = query.toLowerCase().trim();
  const named = members.filter((m) => m.full_name);
  if (!q) return named.slice(0, 6);
  const starts = named.filter((m) => (m.full_name ?? "").toLowerCase().startsWith(q));
  const includes = named.filter(
    (m) =>
      !(m.full_name ?? "").toLowerCase().startsWith(q) &&
      (m.full_name ?? "").toLowerCase().includes(q),
  );
  return [...starts, ...includes].slice(0, 6);
}

const MentionPopover = ({
  query,
  members,
  position,
  activeIndex,
  onPick,
  onActiveChange,
  onClose,
}: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const filtered = filterMembers(members, query);

  useEffect(() => {
    if (!position) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [position, onClose]);

  if (!position) return null;

  // Viewport clamp
  const width = 260;
  const left = Math.min(Math.max(8, position.left), window.innerWidth - width - 8);
  const top = Math.max(8, position.top);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
      style={{
        top,
        left,
        width,
        maxWidth: "calc(100vw - 16px)",
        transform: "translateY(-100%)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 bg-gray-50">
        Mention staff
      </div>
      {filtered.length === 0 ? (
        <div className="px-3 py-3 text-sm text-gray-500">
          No staff matching “@{query}”
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {filtered.map((m, i) => {
            const name = m.full_name ?? "Unnamed";
            const initial = name.trim().charAt(0).toUpperCase();
            const active = i === activeIndex;
            return (
              <li key={m.user_id}>
                <button
                  type="button"
                  onMouseEnter={() => onActiveChange(i)}
                  onClick={() => onPick(m)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-indigo-50 text-indigo-800" : "text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <span className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 text-xs font-semibold">
                    {initial}
                  </span>
                  <span className="flex-1 truncate font-medium">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-3 py-1.5 text-[10px] text-gray-400 bg-gray-50 border-t border-gray-100">
        ↑↓ to navigate · Enter to insert · Esc to close
      </div>
    </div>
  );
};

export default MentionPopover;