import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { startOfDay, endOfDay, format } from "date-fns";
import { TrendingUp, Wallet, Users, AlertTriangle } from "lucide-react";
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
import { isLowStock } from "@/lib/stockUtils";


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
const managerRangeLabels: Record<string, string> = {
  today: "Today",
  "7days": "Last 7 Days",
};

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const Index = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName, signOut } = useAuth();
  const initials = profile?.full_name ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const [timeRange, setTimeRange] = useState("today");
  const [stats, setStats] = useState({ totalSales: 0, activeStaff: 0, stockAlerts: 0 });
  const [cashInHand, setCashInHand] = useState(0);
  const [myTodaySales, setMyTodaySales] = useState(0);
  const isSalesman = profile?.role === "salesman";
  const isManager = profile?.role === "manager";
  const isOwner = profile?.role === "admin";
  const isShopScope = isOwner || isManager;
  const rangeLabels = isManager ? managerRangeLabels : fullRangeLabels;

  // Clamp manager to allowed ranges.
  useEffect(() => {
    if (isManager && !(timeRange in managerRangeLabels)) {
      setTimeRange("7days");
    }
  }, [isManager, timeRange]);

  const fetchStats = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const userId = profile?.id;
    if (!pharmacyId || !userId) return;

    const startDate = getStartDate(timeRange);

    const salesScopedQuery = supabase
      .from("sales")
      .select("total, id, user_id")
      .eq("pharmacy_id", pharmacyId)
      .eq("status", "completed")
      .gte("created_at", startDate);

    // Active staff = profiles with last_seen within the last 5 minutes
    const activeSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [salesRes, staffRes, alertsRes] = await Promise.all([
      isShopScope ? salesScopedQuery : salesScopedQuery.eq("user_id", userId),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("pharmacy_id", pharmacyId)
        .gte("last_seen", activeSince),
      supabase
        .from("medicines")
        .select("id, stock_quantity, stock_alert, product_type, strip_per_pack, pcs_per_strip")
        .eq("pharmacy_id", pharmacyId),
    ]);

    const sales = salesRes.data ?? [];
    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);

    const activeStaff = staffRes.count ?? 0;

    const stockAlerts = (alertsRes.data ?? []).filter(m => isLowStock(m)).length;

    setStats({ totalSales, activeStaff, stockAlerts });
  }, [profile?.pharmacy_id, profile?.id, timeRange, isShopScope]);

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
  }, [profile?.pharmacy_id, profile?.id]);

  const fetchCashInHand = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId || isSalesman) return;
    const today = new Date();
    const from = startOfDay(today).toISOString();
    const to = endOfDay(today).toISOString();
    const dateStr = format(today, "yyyy-MM-dd");

    // Mirrors the formula on Daily Transactions so both screens always agree.
    const [salesRes, txRes, duesRes, settingsRes, prevClosingRes] = await Promise.all([
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
      supabase
        .from("pharmacy_settings")
        .select("starting_cash_balance")
        .eq("pharmacy_id", pharmacyId)
        .maybeSingle(),
      supabase
        .from("daily_closings")
        .select("net_balance")
        .eq("pharmacy_id", pharmacyId)
        .lt("closing_date", dateStr)
        .order("closing_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
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
    const startingBalance = prevClosingRes.data
      ? Number(prevClosingRes.data.net_balance ?? 0)
      : Number(settingsRes.data?.starting_cash_balance ?? 0);

    setCashInHand(
      startingBalance + cashSalesToday + dueReceived + cashInInvestments - paymentsToday,
    );
  }, [profile?.pharmacy_id, isSalesman]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
        fetchStats();
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
  }, [profile?.pharmacy_id, fetchCashInHand, fetchStats, fetchMyTodaySales, isSalesman]);

  const summaryCards = isShopScope
    ? [
        {
          title: "Today's My Sale",
          value: `৳${formatBDT(myTodaySales)}`,
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
        { title: "Active Staff", value: String(stats.activeStaff), icon: Users, color: "bg-blue-100 text-blue-600" },
        { title: "Short Items", value: String(stats.stockAlerts), icon: AlertTriangle, color: "bg-orange-100 text-orange-500", onClick: () => navigate("/short-items") },
      ]
    : [
        { title: "Today's My Sale", value: `৳${formatBDT(myTodaySales)}`, icon: TrendingUp, color: "bg-blue-100 text-blue-600" },
        {
          title: "Cash in Hand",
          value: "N/A",
          icon: Wallet,
          color: "bg-blue-100 text-blue-600",
          onClick: undefined as undefined | (() => void),
        },
        { title: "Active Staff", value: String(stats.activeStaff), icon: Users, color: "bg-blue-100 text-blue-600" },
        { title: "Short Items", value: String(stats.stockAlerts), icon: AlertTriangle, color: "bg-orange-100 text-orange-500", onClick: () => navigate("/short-items") },
      ];

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <AppHeader />

      {/* Business Insights */}
      <div className="px-page pt-3 pb-2">
        <div className="flex items-start justify-between pt-[10px] pb-[5px]">
          <div>
            <h1 className="text-fluid-lg font-bold text-gray-900">Business Insights</h1>
            <p className="text-fluid-xs mt-0.5 text-secondary-foreground">{pharmacyName || "Your Pharmacy"} Overview</p>
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

      {/* Sales Trend Chart */}
      <SalesTrendChart
        pharmacyId={profile?.pharmacy_id}
        timeRange={timeRange}
        scope={isShopScope ? "shop" : "personal"}
      />
    </div>
  );
};

export default Index;
