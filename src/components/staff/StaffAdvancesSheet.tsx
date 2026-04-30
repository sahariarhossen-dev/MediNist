import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { fmtBdt as fmt, startOfMonthIso } from "@/components/staff/PerformanceWidgets";

interface AdvanceRow {
  id: string;
  amount: number;
  occurred_at: string;
  note: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staffName: string;
  userId: string;
  pharmacyId: string;
}

const monthLabel = () =>
  new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} · ${time}`;
};

const descriptionFor = (note: string | null) => {
  if (!note) return "Cash Advance - Approved by Owner";
  const parts = note.split("|").map((s) => s.trim());
  return parts[1] || "Cash Advance - Approved by Owner";
};

export const StaffAdvancesSheet = ({ open, onOpenChange, staffName, userId, pharmacyId }: Props) => {
  const [rows, setRows] = useState<AdvanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId || !pharmacyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("cash_transactions")
        .select("id, amount, occurred_at, note")
        .eq("pharmacy_id", pharmacyId)
        .eq("category", "expense")
        .like("note", `STAFF_ADVANCE:${userId}%`)
        .gte("occurred_at", startOfMonthIso())
        .order("occurred_at", { ascending: false });
      if (!cancelled) {
        setRows((data || []) as AdvanceRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId, pharmacyId]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="text-base font-bold text-left">
            {staffName}'s Advances
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">{monthLabel()}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No advances taken this month.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {fmtDate(r.occurred_at)}
                      </p>
                      <p className="text-sm text-foreground mt-1">
                        {descriptionFor(r.note)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-rose-600 shrink-0">
                      − {fmt(Number(r.amount || 0))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-6 py-4 bg-muted/30 flex items-center justify-between">
          <p className="text-sm font-bold text-foreground">Total Monthly Advance</p>
          <p className="text-lg font-bold text-rose-600 tabular-nums">− {fmt(total)}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default StaffAdvancesSheet;