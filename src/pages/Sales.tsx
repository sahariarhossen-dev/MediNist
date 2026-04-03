import { Plus, Receipt, TrendingUp, ArrowUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Area, AreaChart } from "recharts";
import { toast } from "sonner";

const sparklineData = [
  { v: 320 }, { v: 480 }, { v: 390 }, { v: 520 }, { v: 610 }, { v: 580 },
  { v: 750 }, { v: 690 }, { v: 820 }, { v: 900 }, { v: 870 }, { v: 950 },
];

const salesHistory = [
  { id: "INV-20241", time: "10:24 AM", amount: 2450 },
  { id: "INV-20240", time: "09:51 AM", amount: 1875 },
  { id: "INV-20239", time: "09:12 AM", amount: 3200 },
  { id: "INV-20238", time: "08:45 AM", amount: 960 },
  { id: "INV-20237", time: "08:10 AM", amount: 4120 },
  { id: "INV-20236", time: "Yesterday", amount: 1540 },
];

const Sales = () => {
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sales</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage your daily transactions</p>
      </div>

      <div className="px-5 space-y-5 mt-2">
        {/* Hero — Glassmorphism Create New Sale */}
        <button
          onClick={() => toast.info("Create Sale feature coming soon!")}
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
              <p className="text-3xl font-extrabold text-emerald-600 mt-1.5 tracking-tight">৳12,546</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <ArrowUp className="w-3 h-3" />
                  12%
                </span>
                <span className="text-xs text-gray-400">vs yesterday</span>
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
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#sparkGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Sales History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Sales History</h3>
            <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">View All</button>
          </div>
          <div className="rounded-2xl bg-white shadow-lg shadow-gray-200/60 border border-gray-100 overflow-hidden">
            {salesHistory.map((sale, i) => (
              <div
                key={sale.id}
                className={`flex items-center gap-3.5 px-4 py-3.5 ${i % 2 === 1 ? "bg-emerald-50/40" : ""} ${i !== salesHistory.length - 1 ? "border-b border-gray-100/80" : ""}`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800">{sale.id}</p>
                  <p className="text-xs text-gray-400">{sale.time}</p>
                </div>
                <p className="text-sm font-bold text-emerald-600">৳{sale.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sales;
