import { useEffect, useState } from "react";
import { Search, UserPlus, X, User as UserIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

export type PickedCustomer = {
  id: string;
  name: string;
  phone: string | null;
  total_due: number;
};

interface Props {
  pharmacyId: string;
  selected: PickedCustomer | null;
  onSelect: (c: PickedCustomer | null) => void;
  onQuickAdd: () => void;
}

const CustomerPickerPopover = ({ pharmacyId, selected, onSelect, onQuickAdd }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedCustomer[]>([]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(async () => {
      let q = supabase
        .from("customers")
        .select("id, name, phone, total_due")
        .eq("pharmacy_id", pharmacyId)
        .order("updated_at", { ascending: false })
        .limit(20);
      const term = query.trim();
      if (term) {
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      const { data } = await q;
      setResults((data || []) as PickedCustomer[]);
    }, 150);
    return () => clearTimeout(timeout);
  }, [query, open, pharmacyId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
            selected ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <UserIcon className={`w-4 h-4 ${selected ? "text-blue-600" : "text-gray-500"}`} />
          <div className="flex-1 min-w-0 text-left">
            <p className={`text-xs font-semibold truncate ${selected ? "text-blue-900" : "text-gray-700"}`}>
              {selected ? selected.name : "Walk-in customer"}
            </p>
            {selected?.phone && <p className="text-[10px] text-gray-500 truncate">{selected.phone}</p>}
          </div>
          {selected && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              className="p-1 rounded-md hover:bg-white"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] max-w-md p-0" align="start">
        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or phone"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <button
            onClick={() => { onSelect(null); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 text-left text-gray-700"
          >
            <UserIcon className="w-4 h-4 text-gray-400" />
            Walk-in customer
          </button>
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-t border-gray-100"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                {c.phone && <p className="text-[10px] text-gray-500 truncate">{c.phone}</p>}
              </div>
              {Number(c.total_due) > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  ৳{Math.round(Number(c.total_due))}
                </span>
              )}
            </button>
          ))}
          {results.length === 0 && query && (
            <p className="px-4 py-3 text-xs text-gray-400 text-center">No customers found</p>
          )}
        </div>
        <div className="border-t border-gray-100 p-2">
          <button
            onClick={() => { setOpen(false); onQuickAdd(); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            <UserPlus className="w-4 h-4" />
            Quick Add Customer
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CustomerPickerPopover;