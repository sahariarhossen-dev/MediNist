import { Bell, TrendingUp, FileText, Users, AlertTriangle, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
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

const summaryCards = [
  { title: "Total Sales", value: "৳3,252.3", icon: TrendingUp, color: "bg-blue-100 text-blue-600" },
  { title: "Total Bills", value: "11", icon: FileText, color: "bg-blue-100 text-blue-600" },
  { title: "Active Staff", value: "0", icon: Users, color: "bg-blue-100 text-blue-600" },
  { title: "Stock Alerts", value: "0", icon: AlertTriangle, color: "bg-orange-100 text-orange-500" },
];

const Index = () => {
  const { profile, pharmacyName, signOut } = useAuth();
  const initials = profile?.full_name ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto">
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
            <p className="text-xs text-gray-400 mt-0.5">{pharmacyName || "Your Pharmacy"} Overview</p>
          </div>
          <button className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
            15 Days <ChevronDown size={14} />
          </button>
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
