import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type LedgerEntry = {
  id: string;
  entry_type: "due" | "payment";
  amount: number;
  description: string | null;
  sale_id: string | null;
  occurred_at: string;
};

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const LedgerTimeline = ({ entries }: { entries: LedgerEntry[] }) => {
  const navigate = useNavigate();

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
        <p className="text-sm text-gray-500">No transactions yet</p>
        <p className="text-xs text-gray-400 mt-1">Credit sales and payments will appear here.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-3">
      {entries.map((e) => {
        const isDue = e.entry_type === "due";
        return (
          <li key={e.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3">
            <div className="flex flex-col items-center pt-0.5">
              <span className={`h-3 w-3 rounded-full ${isDue ? "bg-red-500" : "bg-green-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {e.description || (isDue ? "Credit sale" : "Payment received")}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {format(new Date(e.occurred_at), "d MMM yyyy · h:mm a")}
              </p>
              {e.sale_id && (
                <button
                  onClick={() => navigate(`/invoice/${e.sale_id}`)}
                  className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  View invoice <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className={`text-sm font-bold tabular-nums whitespace-nowrap ${isDue ? "text-red-600" : "text-green-600"}`}>
              {isDue ? "+" : "−"}৳{formatBDT(Number(e.amount))}
            </p>
          </li>
        );
      })}
    </ol>
  );
};

export default LedgerTimeline;