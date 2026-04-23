import { MoreVertical, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Prescription } from "./AddPrescriptionSheet";

interface Props {
  prescription: Prescription;
  onAddToSale: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const PrescriptionCard = ({ prescription: p, onAddToSale, onEdit, onDelete }: Props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-blue-500 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-fluid-base font-bold text-gray-900">{p.medicine_name}</p>
          {p.strength && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{p.strength}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-fluid-lg font-mono font-bold text-gray-900 bg-gray-100 px-2.5 py-0.5 rounded-md tracking-wider">
            {p.dosage_frequency}
          </span>
          {p.dosage_timing && (
            <span className="text-xs text-gray-600 font-medium">{p.dosage_timing}</span>
          )}
        </div>
        {p.notes && <p className="text-[11px] text-gray-500 mt-1.5">{p.notes}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <button
          onClick={onAddToSale}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Add to Sale
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-md hover:bg-gray-100">
              <MoreVertical className="w-4 h-4 text-gray-400" />
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