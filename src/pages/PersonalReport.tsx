import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, Receipt, Percent, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SalesTrendChart from "@/components/SalesTrendChart";

function getStartDate(range: string): string {
  const now = new Date();
  switch (range) {
    case "7days":
      now.setDate(now.getDate() - 7);
      break;
    case "15days":
      now.setDate(now.getDate() - 15);
      break;
    case "30days":
      now.setDate(now.getDate() - 30);
      break;
    default:
      now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

const fullRangeLabels: Record<string, string> = {
  today: "Today",
  "7days": "Last 7 Days",
  "15days": "Last 15 Days",
  "30days": "Last 30 Days",
};

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

interface RecentSale {
  id: string;
  total: number;
  created_at: string;
}

interface TopMedicine {
  medicine_name: string;
  qty: number;
  revenue: number;
}

const PersonalReport = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const rangeLabels = fullRangeLabels;

  const [timeRange, setTimeRange] = useState("today");
  const [kpi, setKpi] = useState({ totalSales: 0, invoices: 0, avg: 0, discount: 0 });
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [topItems, setTopItems] = useState<TopMedicine[]>([]);

  const fetchData = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const userId = profile?.id;
    if (!pharmacyId || !userId) return;
    const startDate = getStartDate(timeRange);

    const salesRes = await supabase
      .from("sales")
      .select("id, total, subtotal, discount_amount, created_at")
      .eq("pharmacy_id", pharmacyId)
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("created_at", startDate)
      .order("created_at", { ascending: false });

    const sales = salesRes.data ?? [];
    const totalSales = sales.reduce((s, r) => s + Number(r.total || 0), 0);
    const discount = sales.reduce((s, r: any) => s + Number(r.discount_amount || 0), 0);
    const invoices = sales.length;
    const avg = invoices ? totalSales / invoices : 0;
    setKpi({ totalSales, invoices, avg, discount });
    setRecent(sales.slice(0, 10).map((s: any) => ({ id: s.id, total: Number(s.total), created_at: s.created_at })));

    const ids = sales.map((s) => s.id);
    if (ids.length === 0) {
      setTopItems([]);
      return;
    }
    const itemsRes = await supabase
      .from("sale_items")
      .select("medicine_name, quantity, total_price, sale_id")
      .in("sale_id", ids);
    const grouped = new Map<string, TopMedicine>();
    (itemsRes.data ?? []).forEach((it: any) => {
      const key = it.medicine_name;
      const existing = grouped.get(key) ?? { medicine_name: key, qty: 0, revenue: 0 };
      existing.qty += Number(it.quantity || 0);
      existing.revenue += Number(it.total_price || 0);
      grouped.set(key, existing);
    });
    const top = Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    setTopItems(top);
  }, [profile?.pharmacy_id, profile?.id, timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const kpiCards = useMemo(
    () => [
      { title: "My Total Sales", value: `৳${formatBDT(kpi.totalSales)}`, icon: TrendingUp, color: "bg-blue-100 text-blue-600" },
      { title: "My Invoices", value: String(kpi.invoices), icon: Receipt, color: "bg-emerald-100 text-emerald-600" },
      { title: "Avg. Invoice", value: `৳${formatBDT(kpi.avg)}`, icon: BarChart3, color: "bg-violet-100 text-violet-600" },
      { title: "Discounts Given", value: `৳${formatBDT(kpi.discount)}`, icon: Percent, color: "bg-orange-100 text-orange-500" },
    ],
    [kpi],
  );

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] max-w-md mx-auto pb-24">
      <div className="flex items-center justify-between px-page pt-5 pb-3 bg-[#e9f1fb]">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/60">
          <ArrowLeft size={22} className="text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">My Sales Report</h1>
        <div className="w-8" />
      </div>

      <div className="px-page pt-3 pb-2">
        <div className="flex items-start justify-between pt-[10px] pb-[5px]">
          <div>
            <h2 className="text-fluid-lg font-bold text-gray-900">Personal Performance</h2>
            <p className="text-fluid-xs mt-0.5 text-secondary-foreground">{profile?.full_name || "You"}</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-auto h-8 bg-white border rounded-lg px-3 text-fluid-xs font-medium shadow-sm text-secondary-foreground border-secondary-foreground gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(rangeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-fluid-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-page py-3">
        {kpiCards.map((card) => (
          <Card key={card.title} className="p-4 border-0 shadow-sm rounded-xl bg-white">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon size={18} />
            </div>
            <p className="text-fluid-xs font-medium text-muted-foreground">{card.title}</p>
            <p className="text-fluid-xl font-bold text-gray-900 mt-0.5 tabular-nums truncate">{card.value}</p>
          </Card>
        ))}
      </div>

      <SalesTrendChart pharmacyId={profile?.pharmacy_id} timeRange={timeRange} scope="personal" />

      <div className="px-page pt-3">
        <Card className="border-0 shadow-sm rounded-2xl bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top 5 Medicines I Sold</h3>
          {topItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No sales in this range.</p>
          ) : (
            <ul className="space-y-2">
              {topItems.map((it) => (
                <li key={it.medicine_name} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{it.medicine_name}</p>
                    <p className="text-[11px] text-muted-foreground">Qty: {it.qty}</p>
                  </div>
                  <p className="font-semibold tabular-nums text-gray-900">৳{formatBDT(it.revenue)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="px-page pt-3">
        <Card className="border-0 shadow-sm rounded-2xl bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">My Recent Invoices</h3>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-2.5 cursor-pointer"
                  onClick={() => navigate(`/invoice/${s.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">#{s.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(s.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">৳{formatBDT(s.total)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PersonalReport;