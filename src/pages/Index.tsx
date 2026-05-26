import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { startOfDay, endOfDay } from "date-fns";
import { TrendingUp, Wallet, Users, AlertTriangle, BarChart3, Receipt } from "lucide-react";
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
import AppHeader from "@/components/AppHeader";
import BroadcastBanner from "@/components/BroadcastBanner";
import TopSalesPerformers from "@/components/TopSalesPerformers";
import { isLowStock } from "@/lib/stockUtils";
import { getOpeningBalance } from "@/lib/openingBalance";


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
    default: // today
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

const Index = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName, signOut } = useAuth();
  const initials = profile?.full_name ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const [timeRange, setTimeRange] = useState("today");
  const [cashInHand, setCashInHand] = useState(0);
  const [myTodaySales, setMyTodaySales] = useState(0);
  const [myTodayInvoices, setMyTodayInvoices] = useState(0);
  const [myRangeSales, setMyRangeSales] = useState(0);
  const [myRangeInvoices, setMyRangeInvoices] = useState(0);
  const [shopRangeSales, setShopRangeSales] = useState(0);
  const [activeStaffToday, setActiveStaffToday] = useState(0);
  const [stockAlerts, setStockAlerts] = useState(0);
  const isSalesman = profile?.role === "salesman";
  const isManager = profile?.role === "manager";
  const isOwner = profile?.role === "admin";
  const canSeeShopDashboard = isOwner || isManager;
  const showDateFilter = canSeeShopDashboard || isSalesman;
  const rangeLabels: Record<string, string> = isManager
    ? { today: "Today", "7days": "Last 7 Days" }
    : fullRangeLabels;
  const isToday = timeRange === "today";

  useEffect(() => {
    if (isManager && (timeRange === "15days" || timeRange === "30days")) {
      setTimeRange("today");
    }
  }, [isManager, timeRange]);

  const fetchRangeSales = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const userId = profile?.id;
    if (!pharmacyId || !userId) return;
    if (!canSeeShopDashboard && !isSalesman) return;
    const startDate = getStartDate(timeRange);
    let q = supabase
      .from("sales")
      .select("total, user_id")
      .eq("pharmacy_id", pharmacyId)
      .eq("status", "completed")
      .gte("created_at", startDate);
    if (isSalesman) q = q.eq("user_id", userId);
    const { data } = await q;
    const rows = data ?? [];
    let mine = 0;
    let shop = 0;
    let mineCount = 0;
    for (const r of rows as any[]) {
      const t = Number(r.total || 0);
      shop += t;
      if (r.user_id === userId) {
        mine += t;
        mineCount += 1;
      }
    }
    setMyRangeSales(mine);
    setMyRangeInvoices(mineCount);
    setShopRangeSales(shop);
  }, [profile?.pharmacy_id, profile?.id, timeRange, canSeeShopDashboard, isSalesman]);

  // Today-only meta: active staff count + low-stock count. Independent of range.
  const fetchTodayMeta = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId) return;
    const todayStart = startOfDay(new Date()).toISOString();
    const [staffRes, alertsRes] = await Promise.all([
      supabase
        .from("sales")
        .select("user_id")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", todayStart),
      supabase
        .from("medicines")
        .select("id, stock_quantity, stock_alert, product_type, strip_per_pack, pcs_per_strip")
        .eq("pharmacy_id", pharmacyId),
    ]);
    const staffIds = new Set((staffRes.data ?? []).map((s: any) => s.user_id));
    setActiveStaffToday(staffIds.size);
    setStockAlerts((alertsRes.data ?? []).filter((m: any) => isLowStock(m)).length);
  }, [profile?.pharmacy_id]);

  const fetchMyTodaySales = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const userId = profile?.id;
    if (!pharmacyId || !userId) return;
    const today = new Date();
    const from = startOfDay(today).toISOString();
    const to = endOfDay(today).toISOString();
    const res = await supabase
      .from("sales")
      .select("total")
      .eq("pharmacy_id", pharmacyId)
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("created_at", from)
      .lte("created_at", to);
    const sum = (res.data ?? []).reduce((s, r: any) => s + Number(r.total || 0), 0);
    setMyTodaySales(sum);
    setMyTodayInvoices((res.data ?? []).length);
  }, [profile?.pharmacy_id, profile?.id]);

  const fetchCashInHand = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId || isSalesman) return;
    const today = new Date();
    const from = startOfDay(today).toISOString();
    const to = endOfDay(today).toISOString();

    // Mirrors the formula on Daily Transactions so both screens always agree.
    const [salesRes, txRes, duesRes, startingBalance] = await Promise.all([
      supabase
        .from("sales")
        .select("total")
        .eq("pharmacy_id", pharmacyId)
        .eq("status", "completed")
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("cash_transactions")
        .select("direction,category,amount")
        .eq("pharmacy_id", pharmacyId)
        .gte("occurred_at", from)
        .lte("occurred_at", to),
      supabase
        .from("customer_ledger")
        .select("amount,entry_type")
        .eq("pharmacy_id", pharmacyId)
        .eq("entry_type", "due")
        .gte("occurred_at", from)
        .lte("occurred_at", to),
      getOpeningBalance(pharmacyId, from),
    ]);

    const salesToday = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
    const duesToday = (duesRes.data ?? []).reduce(
      (s, r: any) => s + Number(r.amount || 0),
      0,
    );
    const cashSalesToday = Math.max(0, salesToday - duesToday);
    const txs = txRes.data ?? [];
    const cashInInvestments = txs
      .filter((t: any) => t.direction === "in" && t.category === "other_in")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const dueReceived = txs
      .filter((t: any) => t.direction === "in" && t.category === "due_collection")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const paymentsToday = txs
      .filter((t: any) => t.direction === "out")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    setCashInHand(
      startingBalance + cashSalesToday + dueReceived + cashInInvestments - paymentsToday,
    );
  }, [profile?.pharmacy_id, isSalesman]);

  useEffect(() => {
    fetchRangeSales();
  }, [fetchRangeSales]);

  useEffect(() => {
    fetchTodayMeta();
  }, [fetchTodayMeta]);

  useEffect(() => {
    fetchMyTodaySales();
  }, [fetchMyTodaySales]);

  useEffect(() => {
    if (isSalesman) return;
    fetchCashInHand();
  }, [fetchCashInHand, isSalesman]);

  // Realtime: refresh Cash in Hand when any pharmacy member changes the
  // underlying tables (sales, cash transactions, customer dues, closings).
  useEffect(() => {
    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!isSalesman) fetchCashInHand();
        fetchRangeSales();
        fetchTodayMeta();
        fetchMyTodaySales();
      }, 250);
    };
    const filter = `pharmacy_id=eq.${pharmacyId}`;
    const channel = supabase
      .channel(`dashboard-cash-${pharmacyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_transactions", filter }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_ledger", filter }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_closings", filter }, debounced)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [profile?.pharmacy_id, fetchCashInHand, fetchRangeSales, fetchTodayMeta, fetchMyTodaySales, isSalesman]);

  const summaryCards = canSeeShopDashboard
    ? [
        {
          title: isToday ? "Today's My Sale" : "My Total Sale",
          value: `৳${formatBDT(isToday ? myTodaySales : myRangeSales)}`,
          icon: TrendingUp,
          color: "bg-blue-100 text-blue-600",
          onClick: () => navigate("/personal-report"),
        },
        {
          title: "Cash in Hand",
          value: `৳${formatBDT(cashInHand)}`,
          icon: Wallet,
          color: "bg-blue-100 text-blue-600",
          onClick: () => navigate("/more/daily-transactions"),
        },
        isToday
          ? {
              title: "Active Staff",
              value: String(activeStaffToday),
              icon: Users,
              color: "bg-blue-100 text-blue-600",
              onClick: undefined as undefined | (() => void),
            }
          : {
              title: "Total Shop Sale",
              value: `৳${formatBDT(shopRangeSales)}`,
              icon: BarChart3,
              color: "bg-blue-100 text-blue-600",
              onClick: undefined as undefined | (() => void),
            },
        { title: "Short Items", value: String(stockAlerts), icon: AlertTriangle, color: "bg-orange-100 text-orange-500", onClick: () => navigate("/short-items") },
      ]
    : [
        {
          title: isToday ? "Today's Sale" : "My Personal Sales",
          value: `৳${formatBDT(isToday ? myTodaySales : myRangeSales)}`,
          icon: TrendingUp,
          color: "bg-blue-100 text-blue-600",
          onClick: () => navigate("/personal-report"),
        },
        {
          title: "Total Invoices",
          value: String(isToday ? myTodayInvoices : myRangeInvoices),
          icon: Receipt,
          color: "bg-blue-100 text-blue-600",
          onClick: undefined as undefined | (() => void),
        },
        {
          title: "Average Sales",
          value: (() => {
            const sales = isToday ? myTodaySales : myRangeSales;
            const invs = isToday ? myTodayInvoices : myRangeInvoices;
            return `৳${formatBDT(invs > 0 ? sales / invs : 0)}`;
          })(),
          icon: BarChart3,
          color: "bg-blue-100 text-blue-600",
          onClick: undefined as undefined | (() => void),
        },
        {
          title: "Short Items",
          value: String(stockAlerts),
          icon: AlertTriangle,
          color: "bg-orange-100 text-orange-500",
          onClick: () => navigate("/short-items"),
        },
      ];

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <AppHeader />

      <BroadcastBanner />

      {/* Business Insights */}
      <div className="px-page pt-3 pb-2">
        <div className="flex items-start justify-between pt-[10px] pb-[5px]">
          <div>
            <h1 className="text-fluid-lg font-bold text-gray-900">Business Insights</h1>
            <p className="text-fluid-xs mt-0.5 text-secondary-foreground">{pharmacyName || "Your Pharmacy"} Overview</p>
          </div>
          {showDateFilter && (
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
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 px-page py-3">
        {summaryCards.map((card) => (
          <Card key={card.title} className={`p-4 border-0 shadow-sm rounded-xl bg-white ${card.onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={card.onClick}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon size={18} />
            </div>
            <p className="text-fluid-xs font-medium text-muted-foreground">{card.title}</p>
            <p className="text-fluid-xl font-bold text-gray-900 mt-0.5 tabular-nums truncate">{card.value}</p>
          </Card>
        ))}
      </div>

      {/* Sales Trend Chart + Top Performers */}
      {canSeeShopDashboard ? (
        <>
          <SalesTrendChart
            pharmacyId={profile?.pharmacy_id}
            timeRange={timeRange}
            scope="shop"
          />
          <TopSalesPerformers pharmacyId={profile?.pharmacy_id} timeRange={timeRange} />
        </>
      ) : isSalesman ? (
        <SalesTrendChart
          pharmacyId={profile?.pharmacy_id}
          timeRange={timeRange}
          scope="personal"
        />
      ) : null}
    </div>
  );
};

export default Index;
