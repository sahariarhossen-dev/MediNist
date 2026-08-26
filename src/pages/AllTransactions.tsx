import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type CashTx = {
  id: string;
  occurred_at: string;
  direction: "in" | "out";
  category: string;
  party_name: string | null;
  amount: number;
  note: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  sale_cash: "Medicine Sale",
  due_collection: "Due Collection",
  supplier_payment: "Supplier Payment",
  expense: "Shop Expense",
  other_in: "Other Income",
  other_out: "Other Payment",
};

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const AllTransactions = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<CashTx[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!profile?.pharmacy_id) return;
      setLoading(true);
      const { data } = await supabase
        .from("cash_transactions")
        .select("id,occurred_at,direction,category,party_name,amount,note")
        .eq("pharmacy_id", profile.pharmacy_id)
        .order("occurred_at", { ascending: false });
      setTxs((data ?? []) as CashTx[]);
      setLoading(false);
    };
    load();
  }, [profile?.pharmacy_id]);

  // Group by date for cleaner scrolling
  const grouped = useMemo(() => {
    const map = new Map<string, CashTx[]>();
    for (const t of txs) {
      const key = format(new Date(t.occurred_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [txs]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-md mx-auto pb-10">

      <div className="flex items-center gap-2 px-page pt-3 pb-2">
        <button
          onClick={() => navigate("/more/daily-transactions")}
          className="flex items-center gap-2 text-gray-800"
        >
          <ArrowLeft size={20} />
          <span className="font-semibold text-fluid-base">All Transactions</span>
        </button>
      </div>

      <div className="px-page mt-2">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-fluid-sm">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-fluid-sm text-gray-500">No manual transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <h4 className="text-fluid-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {format(new Date(date), "d MMM yyyy")}
                </h4>
                <div className="space-y-3">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3"
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
                          t.direction === "in" ? "bg-green-100" : "bg-red-100",
                        )}
                      >
                        {t.direction === "in" ? (
                          <Plus size={18} className="text-green-600" strokeWidth={3} />
                        ) : (
                          <Minus size={18} className="text-red-600" strokeWidth={3} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-fluid-sm truncate">
                          {t.party_name || "—"}
                        </p>
                        <p className="text-fluid-xs text-gray-500 truncate">
                          {CATEGORY_LABELS[t.category] || t.category} ·{" "}
                          {format(new Date(t.occurred_at), "h:mm a")}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "font-bold text-fluid-sm whitespace-nowrap tabular-nums",
                          t.direction === "in" ? "text-green-600" : "text-red-600",
                        )}
                      >
                        {t.direction === "in" ? "+" : "−"}৳{formatBDT(Number(t.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AllTransactions;
