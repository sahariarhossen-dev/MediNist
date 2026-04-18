import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import { ArrowLeft, CalendarIcon, Plus, Minus, Wallet } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import LogTransactionSheet from "@/components/transactions/LogTransactionSheet";

type CashTx = {
  id: string;
  occurred_at: string;
  direction: "in" | "out";
  category: string;
  party_name: string | null;
  amount: number;
  note: string | null;
  synthetic?: boolean;
};

type SaleRow = {
  id: string;
  created_at: string;
  total: number;
  sale_type: string;
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

type PreviousClosing = {
  closing_date: string;
  net_balance: number;
};

const DailyTransactions = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [salesRows, setSalesRows] = useState<SaleRow[]>([]);
  const [txs, setTxs] = useState<CashTx[]>([]);
  const [duesOpen, setDuesOpen] = useState(0);
  const [startingBalance, setStartingBalance] = useState(0);
  const [previousClosing, setPreviousClosing] = useState<PreviousClosing | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    setLoading(true);
    const from = startOfDay(date).toISOString();
    const to = endOfDay(date).toISOString();
    const dateStr = format(date, "yyyy-MM-dd");

    const [salesRes, txRes, duesRes, settingsRes, prevClosingRes] = await Promise.all([
      supabase
        .from("sales")
        .select("id,created_at,total,sale_type")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("status", "completed")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false }),
      supabase
        .from("cash_transactions")
        .select("id,occurred_at,direction,category,party_name,amount,note")
        .eq("pharmacy_id", profile.pharmacy_id)
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("customer_dues")
        .select("amount_due,amount_paid")
        .eq("pharmacy_id", profile.pharmacy_id)
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("pharmacy_settings")
        .select("starting_cash_balance")
        .eq("pharmacy_id", profile.pharmacy_id)
        .maybeSingle(),
      supabase
        .from("daily_closings")
        .select("closing_date,net_balance")
        .eq("pharmacy_id", profile.pharmacy_id)
        .lt("closing_date", dateStr)
        .order("closing_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setSalesRows((salesRes.data ?? []) as SaleRow[]);
    setTxs((txRes.data ?? []) as CashTx[]);
    setDuesOpen(
      (duesRes.data ?? []).reduce(
        (s, r: any) => s + (Number(r.amount_due || 0) - Number(r.amount_paid || 0)),
        0,
      ),
    );
    const prev = prevClosingRes.data
      ? {
          closing_date: prevClosingRes.data.closing_date as string,
          net_balance: Number(prevClosingRes.data.net_balance ?? 0),
        }
      : null;
    setPreviousClosing(prev);
    setStartingBalance(
      prev ? prev.net_balance : Number(settingsRes.data?.starting_cash_balance ?? 0),
    );
    setLoading(false);
  }, [profile?.pharmacy_id, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const salesTotal = useMemo(
    () => salesRows.reduce((s, r) => s + Number(r.total || 0), 0),
    [salesRows],
  );

  // Cash sales: completed sales not tied to an open due. Approximation:
  // subtract any open dues from sales total to get the cash portion.
  const cashSalesTotal = useMemo(
    () => Math.max(0, salesTotal - duesOpen),
    [salesTotal, duesOpen],
  );

  // Sales are intentionally NOT shown in the manual transactions feed,
  // but their cash portion still contributes to Cash Received / Cash in Hand.


  // Manual entries only — sales are excluded from the feed but still counted in Cash in Hand.
  const feedItems = useMemo(
    () =>
      [...txs].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      ),
    [txs],
  );

  const visibleFeedItems = useMemo(() => feedItems.slice(0, 5), [feedItems]);

  const manualCashIn = useMemo(
    () =>
      txs
        .filter(
          (t) =>
            t.direction === "in" &&
            (t.category === "sale_cash" ||
              t.category === "due_collection" ||
              t.category === "other_in"),
        )
        .reduce((s, t) => s + Number(t.amount), 0),
    [txs],
  );

  const cashReceived = manualCashIn + cashSalesTotal;

  const totalPayments = useMemo(
    () => txs.filter((t) => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0),
    [txs],
  );

  const cashInHand = startingBalance + cashReceived - totalPayments;

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-10">
      <AppHeader />

      {/* Title row */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <button
          onClick={() => navigate("/more")}
          className="flex items-center gap-2 text-gray-800"
        >
          <ArrowLeft size={20} />
          <span className="font-semibold text-base">Daily Transactions</span>
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-9 rounded-xl bg-white">
              <CalendarIcon size={16} className="text-blue-600" />
              <span className="text-xs font-medium">{format(date, "d MMM")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary cards */}
      <div className="px-5 grid grid-cols-2 gap-3 mt-2">
        <SummaryCard label="Total Sales" value={salesTotal} tone="blue" />
        <SummaryCard label="Cash Received" value={cashReceived} tone="blue-soft" />
        <SummaryCard label="Total Payments" value={totalPayments} tone="teal" />
        <SummaryCard label="Today's Due" value={duesOpen} tone="teal-soft" />
      </div>

      {/* Cash in Hand */}
      <div className="mx-5 mt-4 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
          <Wallet size={20} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-500">Cash in Hand</p>
          <p className="text-lg font-bold text-gray-900">৳{formatBDT(cashInHand)}</p>
        </div>
        <p className="text-[11px] text-gray-400 text-right leading-tight">
          Starting<br />৳{formatBDT(startingBalance)}
        </p>
      </div>

      {/* Feed */}
      <div className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Transactions</h3>
          {feedItems.length > 5 && (
            <button
              onClick={() => navigate("/more/all-transactions")}
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              See All
            </button>
          )}
        </div>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
        ) : visibleFeedItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-gray-500">No manual transactions logged for this date.</p>
            <p className="text-xs text-gray-400 mt-1">
              Add an investment or expense with the + button.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {previousClosing && (
              <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100">
                  <Wallet size={18} className="text-blue-600" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    Closing Balance from {format(new Date(previousClosing.closing_date), "dd/MM/yyyy")}
                  </p>
                  <p className="text-xs text-gray-500 truncate">Carried forward · Opening</p>
                </div>
                <p className="font-bold text-sm whitespace-nowrap text-gray-700">
                  ৳{formatBDT(previousClosing.net_balance)}
                </p>
              </div>
            )}
            {visibleFeedItems.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
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
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {t.party_name || "—"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {CATEGORY_LABELS[t.category] || t.category} · {format(new Date(t.occurred_at), "h:mm a")}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-bold text-sm whitespace-nowrap",
                    t.direction === "in" ? "text-green-600" : "text-red-600",
                  )}
                >
                  {t.direction === "in" ? "+" : "−"}৳{formatBDT(Number(t.amount))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily Closing Summary */}
      <div className="bg-gray-100 rounded-2xl p-4 mt-5 mx-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Closing Summary</h3>
        <div className="space-y-2">
          <SummaryRow label="Total Sales" value={salesTotal} sign="+" tone="green" />
          <SummaryRow label="Total Cash In" value={manualCashIn} sign="+" tone="green" />
          <SummaryRow label="Total Payments" value={totalPayments} sign="−" tone="red" />
          <SummaryRow label="Today's Due" value={duesOpen} sign="" tone="neutral" />
        </div>
        <div className="border-t border-gray-300 mt-3 pt-3 flex items-center justify-between">
          <span className="text-base font-bold text-blue-700">Net Cash Balance</span>
          <span className="text-base font-bold text-blue-700">৳{formatBDT(cashInHand)}</span>
        </div>
      </div>

      {/* Floating Action Button */}
      {profile?.pharmacy_id && profile?.id && (
        <>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Log transaction"
            className="fixed bottom-6 right-1/2 translate-x-[calc(min(50vw,224px)-1.25rem)] h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg flex items-center justify-center text-white transition-colors z-40"
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
          <LogTransactionSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            date={date}
            pharmacyId={profile.pharmacy_id}
            userId={profile.id}
            onSaved={loadData}
          />
        </>
      )}
    </div>
  );
};

const SummaryCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "blue-soft" | "teal" | "teal-soft";
}) => {
  const styles = {
    blue: "bg-blue-600 text-white",
    "blue-soft": "bg-blue-50 text-blue-700",
    teal: "bg-teal-600 text-white",
    "teal-soft": "bg-teal-50 text-teal-700",
  }[tone];
  const labelClass = tone.endsWith("soft") ? "opacity-70" : "opacity-90";
  return (
    <div className={cn("rounded-2xl p-4 shadow-sm", styles)}>
      <p className={cn("text-xs font-medium", labelClass)}>{label}</p>
      <p className="text-xl font-bold mt-1">৳{formatBDT(value)}</p>
    </div>
  );
};

export default DailyTransactions;
