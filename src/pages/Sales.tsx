import { useState, useEffect } from "react";
import { Plus, Receipt, ArrowUp } from "lucide-react";
import { ResponsiveContainer, Area, AreaChart } from "recharts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const sparklineData = [
  { v: 320 }, { v: 480 }, { v: 390 }, { v: 520 }, { v: 610 }, { v: 580 },
  { v: 750 }, { v: 690 }, { v: 820 }, { v: 900 }, { v: 870 }, { v: 950 },
];

interface SaleRow {
  id: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  created_at: string;
  status: string;
  sale_type: string;
}

interface SaleItemRow {
  id: string;
  medicine_name: string;
  company_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

const Sales = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingSale, setViewingSale] = useState<SaleRow | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<SaleItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    const fetchSales = async () => {
      setLoading(true);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("sales")
        .select("id, total, subtotal, discount_amount, discount_percent, created_at, status, sale_type")
        .eq("pharmacy_id", profile.pharmacy_id!)
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false });

      setSales((data as SaleRow[]) || []);
      setLoading(false);
    };
    fetchSales();
  }, [profile?.pharmacy_id]);

  const todayTotal = sales
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + Number(s.total), 0);

  const completedCount = sales.filter((s) => s.status === "completed").length;

  const formatTime = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      return isToday(d) ? format(d, "hh:mm a") : format(d, "dd MMM");
    } catch {
      return dateStr;
    }
  };

  const shortId = (id: string) => `INV-${id.slice(0, 5).toUpperCase()}`;

  const handleSaleClick = async (sale: SaleRow) => {
    if (sale.status === "draft") {
      navigate(`/create-sale?draft=${sale.id}`);
    } else {
      setViewingSale(sale);
      setLoadingItems(true);
      const { data } = await supabase
        .from("sale_items")
        .select("id, medicine_name, company_name, quantity, unit_price, total_price")
        .eq("sale_id", sale.id);
      setInvoiceItems((data as SaleItemRow[]) || []);
      setLoadingItems(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sales</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage your daily transactions</p>
      </div>

      <div className="px-5 space-y-5 mt-2">
        {/* Hero — Create New Sale */}
        <button
          onClick={() => navigate("/create-sale")}
          className="w-full relative overflow-hidden rounded-3xl border border-white/30 bg-gradient-to-br from-emerald-500/90 via-emerald-600/85 to-emerald-700/90 backdrop-blur-xl shadow-xl shadow-emerald-500/20 p-6 text-left transition-transform active:scale-[0.98]"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-300/20 rounded-full blur-2xl" />
          <div className="relative flex items-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-white/20 animate-ping" style={{ animationDuration: "2.5s" }} />
              <div className="relative w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                <Plus className="w-8 h-8 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-100/80">New Transaction</span>
              <h2 className="text-xl font-bold text-white mt-0.5 tracking-tight">CREATE NEW SALE</h2>
            </div>
          </div>
        </button>

        {/* Analytics Card */}
        <div className="rounded-2xl bg-white shadow-lg shadow-gray-200/60 border border-gray-100 p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Today's Total Sale</p>
              <p className="text-3xl font-extrabold text-emerald-600 mt-1.5 tracking-tight">৳{todayTotal.toLocaleString()}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <ArrowUp className="w-3 h-3" />
                  {completedCount} sales
                </span>
                <span className="text-xs text-gray-400">today</span>
              </div>
            </div>
            <div className="w-28 h-16 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData}>
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2.5} fill="url(#sparkGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Sales History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Sales History</h3>
            <span className="text-xs font-semibold text-gray-400">Today</span>
          </div>
          <div className="rounded-2xl bg-white shadow-lg shadow-gray-200/60 border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : sales.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No sales today yet</div>
            ) : (
              sales.map((sale, i) => (
                <div
                  key={sale.id}
                  onClick={() => handleSaleClick(sale)}
                  className={`flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition ${i % 2 === 1 ? "bg-emerald-50/40" : ""} ${i !== sales.length - 1 ? "border-b border-gray-100/80" : ""}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-800">{shortId(sale.id)}</p>
                      <Badge
                        className={`text-[10px] px-2 py-0.5 font-semibold ${
                          sale.status === "completed"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {sale.status === "completed" ? "Complete" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatTime(sale.created_at)}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">৳{Number(sale.total).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Invoice View Dialog */}
      <Dialog open={!!viewingSale} onOpenChange={(open) => !open && setViewingSale(null)}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">
              {viewingSale && shortId(viewingSale.id)}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              {viewingSale && formatTime(viewingSale.created_at)} · {viewingSale?.sale_type === "wholesale" ? "Wholesale" : "Retail"}
            </DialogDescription>
          </DialogHeader>

          {loadingItems ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading items…</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {invoiceItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.medicine_name}</p>
                    {item.company_name && (
                      <p className="text-[10px] text-gray-400">{item.company_name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-xs text-gray-500">{item.quantity} × ৳{item.unit_price}</p>
                    <p className="text-sm font-bold text-emerald-600">৳{Number(item.total_price).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewingSale && !loadingItems && (
            <div className="border-t border-gray-200 pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-gray-800">৳{Number(viewingSale.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Discount ({viewingSale.discount_percent}%)</span>
                <span className="font-semibold text-gray-800">-৳{Number(viewingSale.discount_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-gray-200">
                <span className="font-extrabold text-gray-900">Net Total</span>
                <span className="font-extrabold text-emerald-700">৳{Number(viewingSale.total).toLocaleString()}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sales;
