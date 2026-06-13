import { Pin, Users, Phone, ListChecks, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Note } from "@/hooks/useNotes";
import { colorClasses } from "./ColorPicker";

interface NoteCardProps {
  note: Note;
  creatorName?: string;
  isMine: boolean;
  onClick: () => void;
}

function stripHtml(html: string): string {
  // Strip tags via regex only — never assign untrusted HTML to innerHTML,
  // because event handlers (e.g. <img onerror>) would still fire.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function formatReminder(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date}, ${time}`;
}

const NoteCard = ({ note, creatorName, isMine, onClick }: NoteCardProps) => {
  const textBlocks = note.content.filter((b) => b.type === "text") as Extract<
    Note["content"][number],
    { type: "text" }
  >[];
  const checklists = note.content.filter((b) => b.type === "checklist") as Extract<
    Note["content"][number],
    { type: "checklist" }
  >[];
  const images = note.content.filter((b) => b.type === "image") as Extract<
    Note["content"][number],
    { type: "image" }
  >[];

  const previewText = textBlocks
    .map((b) => stripHtml(b.html))
    .join(" ")
    .slice(0, 240);

  const totalChecklist = checklists.reduce((acc, b) => acc + b.items.length, 0);
  const doneChecklist = checklists.reduce(
    (acc, b) => acc + b.items.filter((i) => i.checked).length,
    0,
  );

  // reminder_at is not yet a persisted column — read defensively so the badge
  // lights up the moment the migration lands without requiring a type change.
  const reminderAt = (note as unknown as { reminder_at?: string | null }).reminder_at ?? null;

  const showBadgeRow =
    !!reminderAt ||
    note.is_public ||
    note.contact_numbers.length > 0 ||
    (!isMine && !!creatorName);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group mb-2 w-full text-left break-inside-avoid",
        "rounded-2xl border border-slate-100 dark:border-slate-800/60",
        "shadow-[0_2px_8px_rgba(15,23,42,0.03),0_1px_3px_rgba(15,23,42,0.02)]",
        "hover:shadow-[0_4px_16px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.03)]",
        "transition-all duration-200 p-4 flex flex-col",
        colorClasses(note.color),
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="flex-1 font-semibold text-slate-900 dark:text-slate-100 tracking-tight text-[15px] line-clamp-1">
          {note.title || "Untitled"}
        </h3>
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
          {note.is_pinned && (
            <Pin size={13} className="text-amber-500 fill-amber-400" />
          )}
        </div>
      </div>

      {previewText && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal line-clamp-3 mb-2 whitespace-pre-line">
          {previewText}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {images.slice(0, 4).map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt={img.caption || ""}
              loading="lazy"
              className="w-full h-20 object-cover rounded-lg"
            />
          ))}
        </div>
      )}

      {totalChecklist > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
          <ListChecks size={12} />
          <span>
            {doneChecklist}/{totalChecklist} done
          </span>
        </div>
      )}

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {note.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 rounded-full px-1.5 py-0.5"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {showBadgeRow && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3 mt-auto border-t border-slate-100/60 dark:border-slate-800/40">
          {reminderAt && (
            <span className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <Clock size={10} />
              {formatReminder(reminderAt)}
            </span>
          )}
          {note.is_public && (
            <span className="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <Users size={10} />
              Shared
            </span>
          )}
          {note.contact_numbers.length > 0 && (
            <span className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <Phone size={10} />
              {note.contact_numbers.length}
            </span>
          )}
          {!isMine && creatorName && (
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400 ml-auto">
              <span className="h-[18px] w-[18px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[9px] flex items-center justify-center">
                {initials(creatorName)}
              </span>
              <span className="truncate max-w-[80px]">{creatorName}</span>
            </span>
          )}
        </div>
      )}
    </button>
  );
};

export default NoteCard;