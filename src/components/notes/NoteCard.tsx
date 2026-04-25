import { Pin, Users, Phone, ListChecks, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Note } from "@/hooks/useNotes";
import { colorBg } from "./ColorPicker";

interface NoteCardProps {
  note: Note;
  creatorName?: string;
  isMine: boolean;
  onClick: () => void;
}

function stripHtml(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
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
    .slice(0, 180);

  const totalChecklist = checklists.reduce((acc, b) => acc + b.items.length, 0);
  const doneChecklist = checklists.reduce(
    (acc, b) => acc + b.items.filter((i) => i.checked).length,
    0,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-3 w-full text-left rounded-2xl border border-gray-200 p-3 shadow-sm break-inside-avoid hover:shadow-md transition",
        colorBg(note.color),
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 flex-1">
          {note.title || "Untitled"}
        </h3>
        {note.is_pinned && (
          <Pin size={14} className="text-amber-600 flex-shrink-0 fill-amber-500" />
        )}
      </div>

      {previewText && (
        <p className="text-xs text-gray-700 whitespace-pre-line line-clamp-4 mb-2">
          {previewText}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-1 mb-2">
          {images.slice(0, 4).map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt={img.caption || ""}
              loading="lazy"
              className="w-full h-16 object-cover rounded"
            />
          ))}
        </div>
      )}

      {totalChecklist > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
          <ListChecks size={12} />
          <span>
            {doneChecklist}/{totalChecklist} done
          </span>
        </div>
      )}

      {note.contact_numbers.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-1.5">
          <Phone size={12} />
          <span>{note.contact_numbers.length} contact(s)</span>
        </div>
      )}

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {note.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/5">
        <span className="text-[10px] text-gray-500">
          {new Date(note.updated_at).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-2">
          {!isMine && creatorName && (
            <span className="text-[10px] text-gray-500 truncate max-w-[100px]">
              by {creatorName}
            </span>
          )}
          {note.is_public && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 font-medium">
              <Users size={10} /> Shared
            </span>
          )}
          {images.length > 0 && (
            <ImageIcon size={11} className="text-gray-400" />
          )}
        </div>
      </div>
    </button>
  );
};

export default NoteCard;