import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, TrendingUp, FileText, Users, AlertTriangle, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const salesData = [
  { time: "10AM", value: 800 },
  { time: "11AM", value: 1800 },
  { time: "12PM", value: 3200 },
  { time: "1PM", value: 2600 },
  { time: "2PM", value: 1900 },
  { time: "3PM", value: 1400 },
  { time: "4PM", value: 1100 },
  { time: "5PM", value: 900 },
  { time: "6PM", value: 700 },
  { time: "7PM", value: 500 },
  { time: "8PM", value: 400 },
  { time: "9PM", value: 300 },
  { time: "10PM", value: 200 },
  { time: "11PM", value: 150 },
  { time: "12AM", value: 100 },
];

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

const rangeLabels: Record<string, string> = {
  today: "Today",
  "7days": "Last 7 Days",
  "15days": "Last 15 Days",
  "30days": "Last 30 Days",
};

const Index = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName, signOut } = useAuth();
  const initials = profile?.full_name ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const [timeRange, setTimeRange] = useState("today");
  const [stats, setStats] = useState({ totalSales: 0, totalBills: 0, activeStaff: 0, stockAlerts: 0 });

  const fetchStats = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId) return;

    const startDate = getStartDate(timeRange);

    const [salesRes, staffRes, alertsRes] = await Promise.all([
      supabase
        .from("sales")
        .select("total, id, user_id")
        .eq("pharmacy_id", pharmacyId)
        .eq("status", "completed")
        .gte("created_at", startDate),
      supabase
        .from("sales")
        .select("user_id")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", startDate),
      supabase
        .from("medicines")
        .select("id, stock_quantity, stock_alert")
        .eq("pharmacy_id", pharmacyId),
    ]);

    const sales = salesRes.data ?? [];
    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalBills = sales.length;

    const staffIds = new Set((staffRes.data ?? []).map(s => s.user_id));
    const activeStaff = staffIds.size;

    const stockAlerts = (alertsRes.data ?? []).filter(m => {
      const threshold = m.stock_alert && m.stock_alert > 0 ? m.stock_alert : 5;
      return (m.stock_quantity ?? 0) < threshold;
    }).length;

    setStats({ totalSales, totalBills, activeStaff, stockAlerts });
  }, [profile?.pharmacy_id, timeRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const summaryCards = [
    { title: "Total Sales", value: `৳${stats.totalSales.toLocaleString()}`, icon: TrendingUp, color: "bg-blue-100 text-blue-600" },
    { title: "Total Bills", value: String(stats.totalBills), icon: FileText, color: "bg-blue-100 text-blue-600" },
    { title: "Active Staff", value: String(stats.activeStaff), icon: Users, color: "bg-blue-100 text-blue-600" },
    { title: "Short Items", value: String(stats.stockAlerts), icon: AlertTriangle, color: "bg-orange-100 text-orange-500" },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <span className="text-xl font-bold text-blue-600 tracking-tight">Medinist</span>
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-full hover:bg-gray-100 transition">
            <Bell size={22} className="text-gray-600" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <Avatar className="h-9 w-9" onClick={signOut} title="Sign out">
            <AvatarFallback className="bg-blue-500 text-white text-sm font-semibold cursor-pointer">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Business Insights */}
      <div className="px-5 pt-3 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Business Insights</h1>
            <p className="text-xs mt-0.5 text-secondary-foreground">{pharmacyName || "Your Pharmacy"} Overview</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-auto h-8 bg-white border rounded-lg px-3 text-xs font-medium shadow-sm text-secondary-foreground border-secondary-foreground gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(rangeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 px-5 py-3">
        {summaryCards.map((card) => (
          <Card key={card.title} className="p-4 border-0 shadow-sm rounded-xl bg-white">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon size={18} />
            </div>
            <p className="text-[11px] text-gray-400 font-medium">{card.title}</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{card.value}</p>
          </Card>
        ))}
      </div>

      {/* Hourly Sales Trend */}
      <div className="px-5 pt-3 pb-6">
        <Card className="border-0 shadow-sm rounded-xl bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Hourly Sales Trend</h2>
          <p className="text-[11px] text-gray-400 mb-4">(8AM-12AM)</p>
          <div className="h-48 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  interval={2}
                />
                <YAxis hide />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fill="url(#blueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="h-1.5 bg-amber-400 rounded-full mt-2" />
        </Card>
      </div>
    </div>
  );
};

export default Index;
