import { Layers, MapPin, Pill, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { MedicineCardData } from "@/lib/chatCards";

const ChatMedicineCard = ({ data }: { data: MedicineCardData }) => {
  const outOfStock = data.stock === 0;
  const lowStock = data.stock > 0 && data.stock < 20;

  return (
    <div
      className={`rounded-2xl p-4 max-w-xs shadow-sm border ${
        outOfStock ? "bg-amber-50/50 border-amber-100" : "bg-slate-50 border-slate-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0">
          <Pill className="h-3.5 w-3.5 text-indigo-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 break-words leading-tight">
            {data.name}
          </p>
          <p className="text-[11px] text-slate-500 italic mt-0.5">{data.generic}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Shelf:</span>
          <span className="font-medium text-slate-800">{data.shelf}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Stock:</span>
          <span
            className={
              outOfStock
                ? "font-semibold text-red-600"
                : lowStock
                ? "font-semibold text-amber-600"
                : "font-medium text-slate-800"
            }
          >
            {data.stock} {data.unit}
            {outOfStock && " · Out"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Price:</span>
          <span className="font-medium text-slate-800">{data.price.toFixed(2)} BDT</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => toast({ title: "Details", description: "Inventory deep-link coming soon." })}
          className="text-xs text-indigo-600 font-medium hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          View Details
        </button>
        <button
          onClick={() => toast({ title: "Order More", description: `${data.name} queued for reorder.` })}
          className="text-xs bg-slate-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Order More
        </button>
      </div>
    </div>
  );
};

export default ChatMedicineCard;