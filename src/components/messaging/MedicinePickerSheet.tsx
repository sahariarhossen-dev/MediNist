import { useMemo, useState } from "react";
import { Search, Pill } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { MOCK_MEDICINES, type MedicineCardData } from "@/lib/chatCards";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (med: MedicineCardData) => void;
}

const MedicinePickerSheet = ({ open, onOpenChange, onSelect }: Props) => {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return MOCK_MEDICINES;
    return MOCK_MEDICINES.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.generic.toLowerCase().includes(term),
    );
  }, [q]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Share Drug Card</SheetTitle>
        </SheetHeader>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search medicine from inventory..."
            className="pl-9 bg-slate-100 border-0"
          />
        </div>
        <ul className="mt-3 space-y-1">
          {results.length === 0 && (
            <li className="text-center text-xs text-slate-500 py-6">No medicines found.</li>
          )}
          {results.map((m) => {
            const out = m.stock === 0;
            const low = m.stock > 0 && m.stock < 20;
            return (
              <li key={m.id}>
                <button
                  onClick={() => {
                    onSelect(m);
                    onOpenChange(false);
                    setQ("");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <Pill className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{m.name}</p>
                    <p className="text-[11px] text-slate-500 italic truncate">
                      {m.generic} · Shelf {m.shelf}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs ${
                        out
                          ? "text-red-600 font-semibold"
                          : low
                          ? "text-amber-600 font-semibold"
                          : "text-slate-700 font-medium"
                      }`}
                    >
                      {m.stock} {m.unit}
                    </p>
                    <p className="text-[10px] text-slate-400">{m.price.toFixed(2)} BDT</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default MedicinePickerSheet;