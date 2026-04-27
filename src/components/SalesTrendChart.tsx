import { useState, useEffect, useCallback } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SalesTrendChartProps {
  pharmacyId: string | null | undefined;
  timeRange: string;
  scope?: "shop" | "personal";
}

interface ChartPoint {
  label: string;
  amount: number;
  invoices: number;
  dateKey: string;
}

interface ModalData {
  label: string;
  amount: number;
  invoices: number;
}

const HOURLY_SLOTS = [
  { label: "8 AM", start: 8, end: 10 },
  { label: "10 AM", start: 10, end: 12 },
  { label: "12 PM", start: 12, end: 14 },
  { label: "2 PM", start: 14, end: 16 },
  { label: "4 PM", start: 16, end: 18 },
  { label: "6 PM", start: 18, end: 20 },
  { label: "8 PM", start: 20, end: 22 },
  { label: "10 PM", start: 22, end: 24 },
  { label: "12 AM", start: 0, end: 2 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-xl px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="text-sm font-bold text-blue-600">৳{payload[0].value.toLocaleString()}</p>
      <p className="text-[10px] text-muted-foreground">{payload[0].payload.invoices} invoices</p>
    </div>
  );
};

const SalesTrendChart = ({ pharmacyId, timeRange, scope = "personal" }: SalesTrendChartProps) => {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  const isToday = timeRange === "today";

  const title = isToday
    ? "Today's Hourly Sales Trend"
    : `Last ${timeRange.replace("days", "")} Days Sales Trend`;

  const subtitle = isToday ? "(8AM - 12AM)" : "";

  const fetchChartData = useCallback(async () => {
    if (!pharmacyId || !userId) return;

    const now = new Date();
    let startDate: Date;

    if (isToday) {
      startDate = startOfDay(now);
    } else {
      const days = parseInt(timeRange.replace("days", ""));
      startDate = subDays(startOfDay(now), days);
    }

    let salesQuery = supabase
      .from("sales")
      .select("id, total, created_at")
      .eq("pharmacy_id", pharmacyId)
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString());
    if (scope === "personal") salesQuery = salesQuery.eq("user_id", userId);
    const { data: sales } = await salesQuery;

    if (!sales) {
      setChartData([]);
      return;
    }

    if (isToday) {
      const points: ChartPoint[] = HOURLY_SLOTS.map((slot) => {
        const matching = sales.filter((s) => {
          const h = new Date(s.created_at).getHours();
          if (slot.start < slot.end) return h >= slot.start && h < slot.end;
          return h >= slot.start || h < slot.end;
        });
        return {
          label: slot.label,
          amount: matching.reduce((sum, s) => sum + Number(s.total), 0),
          invoices: matching.length,
          dateKey: `${slot.start}-${slot.end}`,
        };
      });
      setChartData(points);
    } else {
      const grouped: Record<string, { amount: number; invoices: number }> = {};
      const days = parseInt(timeRange.replace("days", ""));

      for (let i = days; i >= 0; i--) {
        const d = subDays(now, i);
        const key = format(d, "MMM d");
        grouped[key] = { amount: 0, invoices: 0 };
      }

      sales.forEach((s) => {
        const key = format(parseISO(s.created_at), "MMM d");
        if (grouped[key]) {
          grouped[key].amount += Number(s.total);
          grouped[key].invoices += 1;
        }
      });

      const points: ChartPoint[] = Object.entries(grouped).map(([label, data]) => ({
        label,
        amount: data.amount,
        invoices: data.invoices,
        dateKey: label,
      }));
      setChartData(points);
    }
  }, [pharmacyId, userId, timeRange, isToday, scope]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // Realtime: refresh chart when sales change in this pharmacy.
  useEffect(() => {
    if (!pharmacyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchChartData(), 250);
    };
    const channel = supabase
      .channel(`sales-trend-${pharmacyId}-${scope}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales", filter: `pharmacy_id=eq.${pharmacyId}` },
        debounced,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [pharmacyId, scope, fetchChartData]);

  const handlePointClick = async (data: any) => {
    if (!data?.activePayload?.length || !pharmacyId || !userId) return;
    const point = data.activePayload[0].payload as ChartPoint;

    setLoadingModal(true);
    setModalOpen(true);

    // Fetch top items for this period
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (isToday) {
      const slot = HOURLY_SLOTS.find((s) => `${s.start}-${s.end}` === point.dateKey);
      if (slot) {
        startDate = startOfDay(now);
        startDate.setHours(slot.start);
        endDate = new Date(startDate);
        if (slot.start < slot.end) {
          endDate.setHours(slot.end);
        } else {
          endDate.setDate(endDate.getDate() + 1);
          endDate.setHours(slot.end);
        }
      } else {
        startDate = startOfDay(now);
        endDate = now;
      }
    } else {
      // Parse "MMM d" back - use current year
      const year = now.getFullYear();
      const parsed = new Date(`${point.dateKey}, ${year}`);
      startDate = startOfDay(parsed);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    }

    let periodQuery = supabase
      .from("sales")
      .select("id")
      .eq("pharmacy_id", pharmacyId)
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString());
    if (scope === "personal") periodQuery = periodQuery.eq("user_id", userId);
    const { data: periodSales } = await periodQuery;

    setModalData({
      label: point.label,
      amount: point.amount,
      invoices: point.invoices,
    });
    setLoadingModal(false);
  };

  const chartWidth = isToday
    ? Math.max(480, chartData.length * 60)
    : Math.max(480, chartData.length * 50);

  return (
    <div className="px-5 pt-3 pb-6">
      <Card className="border-0 shadow-sm rounded-3xl bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-0.5">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground mb-4">{subtitle}</p>}
        {!subtitle && <div className="mb-4" />}

        <div className="chart-scroll-container overflow-x-auto -ml-2">
          <div style={{ width: chartWidth, minHeight: 192 }}>
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={chartData} onClick={handlePointClick}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  interval={0}
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fill="url(#salesGradient)"
                  dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-2xl max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Sales Summary — {modalData?.label}
            </DialogTitle>
          </DialogHeader>
          {loadingModal ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : modalData ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Total Sales</p>
                <p className="text-lg font-bold text-foreground">৳{modalData.amount.toLocaleString()}</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-[11px] text-muted-foreground">Invoices</p>
                <p className="text-lg font-bold text-foreground">{modalData.invoices}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesTrendChart;
