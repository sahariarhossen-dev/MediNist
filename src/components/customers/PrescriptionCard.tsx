import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Prescription } from "./AddPrescriptionSheet";

interface Props {
  prescription: Prescription;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const SLOT_LABELS = ["Morning", "Noon", "Night"];
const SLOT_STYLES = [
  "bg-amber-50 text-amber-700 border-amber-100",
  "bg-sky-50 text-sky-700 border-sky-100",
  "bg-indigo-50 text-indigo-700 border-indigo-100",
];

const parseDosage = (raw: string): number[] | null => {
  const parts = raw.split("+").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
};

const PrescriptionCard = ({ prescription: p, selected, onToggleSelect, onEdit, onDelete }: Props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const slots = parseDosage(p.dosage_frequency);

  return (
    <div
      onClick={onToggleSelect}
      className={cn(
        "bg-white rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-gray-100 border-l-[3px] border-l-emerald-400/70 flex items-start gap-3 cursor-pointer transition",
        selected && "ring-2 ring-emerald-500 bg-emerald-50/30",
      )}
    >
      <div className="pt-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${p.medicine_name}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[15px] font-semibold text-gray-900 tracking-tight">{p.medicine_name}</p>
          {p.strength && (
            <span className="text-[10.5px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">{p.strength}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {slots ? (
            slots.map((n, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border",
                  SLOT_STYLES[i],
                  n === 0 && "opacity-40",
                )}
                title={SLOT_LABELS[i]}
              >
                <span className="font-mono tabular-nums">{n}</span>
                <span className="font-normal opacity-80">{SLOT_LABELS[i][0]}</span>
              </span>
            ))
          ) : (
            <span className="text-xs font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
              {p.dosage_frequency}
            </span>
          )}
          {p.dosage_timing && (
            <span className="text-[10.5px] italic text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
              {p.dosage_timing}
            </span>
          )}
        </div>

        {p.notes && <p className="text-[11px] italic text-gray-400 mt-1.5">{p.notes}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default PrescriptionCard;
