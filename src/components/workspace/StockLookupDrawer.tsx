import { useEffect, useMemo, useState } from "react";
import { Search, PackageSearch, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Med {
  id: string;
  name: string;
  company_name: string | null;
  stock_quantity: number | null;
  stock_alert: number | null;
  price: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** "stock" = lookup, "reorder" = only low/out-of-stock items with a draft list. */
  mode: "stock" | "reorder";
  /** Optional starting search term pulled from the AI answer. */
  initialQuery?: string;
  /** Called with a ready-to-send re-order draft. */
  onCreateDraft?: (draft: string) => void;
}

const StockLookupDrawer = ({ open, onOpenChange, mode, initialQuery = "", onCreateDraft }: Props) => {
  const { profile } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open || !profile?.pharmacy_id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("medicines")
        .select("id, name, company_name, stock_quantity, stock_alert, price")
        .eq("pharmacy_id", profile.pharmacy_id)
        .order("name", { ascending: true })
        .limit(500);
      if (!cancelled) {
        setMeds((data ?? []) as Med[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profile?.pharmacy_id]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meds
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .filter((m) =>
        mode === "reorder" ? (m.stock_quantity ?? 0) <= (m.stock_alert ?? 10) : true
      )
      .slice(0, 60);
  }, [meds, query, mode]);

  const selected = rows.filter((r) => picked[r.id]);

  const createDraft = () => {
    const list = (selected.length > 0 ? selected : rows).slice(0, 30);
    const draft = [
      "🧾 *Re-order request*",
      ...list.map(
        (m, i) =>
          `${i + 1}. ${m.name}${m.company_name ? ` (${m.company_name})` : ""} — stock ${m.stock_quantity ?? 0}`
      ),
    ].join("\n");
    onCreateDraft?.(draft);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6">
        <SheetHeader className="px-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            {mode === "reorder" ? (
              <ShoppingCart className="h-4 w-4 text-emerald-600" />
            ) : (
              <PackageSearch className="h-4 w-4 text-indigo-500" />
            )}
            {mode === "reorder" ? "Re-order draft" : "Stock lookup"}
          </SheetTitle>
          <SheetDescription className="text-[12.5px]">
            {mode === "reorder"
              ? "Low-stock items from your inventory. Pick items and build a re-order list."
              : "Live stock straight from your inventory — no need to leave the chat."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pb-3 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search medicine"
              className="border-0 bg-slate-100 pl-9"
            />
          </div>
        </div>

        <div className="max-h-[45vh] overflow-y-auto">
          {loading && <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No matching medicine.</p>
          )}
          {rows.map((m) => {
            const stock = m.stock_quantity ?? 0;
            const low = stock <= (m.stock_alert ?? 10);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPicked((p) => ({ ...p, [m.id]: !p[m.id] }))}
                className={
                  "flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition " +
                  (picked[m.id] ? "bg-emerald-50/70" : "hover:bg-slate-50")
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-slate-900">{m.name}</p>
                  <p className="truncate text-[11.5px] text-slate-500">
                    {m.company_name || "—"}
                    {m.price != null ? ` · ৳${m.price}` : ""}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums " +
                    (stock === 0
                      ? "bg-red-100 text-red-700"
                      : low
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-700")
                  }
                >
                  {stock}
                </span>
              </button>
            );
          })}
        </div>

        {mode === "reorder" && rows.length > 0 && (
          <div className="px-5 pt-3">
            <Button onClick={createDraft} className="w-full rounded-full">
              Build re-order list ({selected.length > 0 ? selected.length : rows.length})
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default StockLookupDrawer;
