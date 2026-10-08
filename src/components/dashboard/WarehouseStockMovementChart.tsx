import { useState, useEffect, useCallback } from "react";
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
import { warehouseStorage } from "@/services/warehouseStorage";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WarehouseStockMovementChartProps {
  pharmacyId: string | null | undefined;
  locationId: string | null | undefined;
}

export interface MovementPoint {
  hour: number;
  label: string;
  time: string;
  inbound_qty: number;
  inbound_val: number;
  outbound_qty: number;
  outbound_val: number;
  net_qty: number;
  net_val: number;
}

interface ModalData {
  label: string;
  time: string;
  inbound_qty: number;
  inbound_val: number;
  outbound_qty: number;
  outbound_val: number;
  net_qty: number;
  net_val: number;
}

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const generateEmpty24HourBuckets = (): MovementPoint[] => {
  return Array.from({ length: 24 }, (_, h) => {
    let label = "12 AM";
    if (h === 12) label = "12 PM";
    else if (h < 12 && h > 0) label = `${h} AM`;
    else if (h > 12) label = `${h - 12} PM`;

    return {
      hour: h,
      label,
      time: `${String(h).padStart(2, "0")}:00`,
      inbound_qty: 0,
      inbound_val: 0,
      outbound_qty: 0,
      outbound_val: 0,
      net_qty: 0,
      net_val: 0,
    };
  });
};

const CustomMovementTooltip = ({ active, payload, label, metricType }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as MovementPoint;
  const isPieces = metricType === "pieces";

  return (
    <div className="bg-background border border-border rounded-xl px-3.5 py-2.5 shadow-lg min-w-[170px]">
      <p className="text-xs font-semibold text-foreground mb-1">{label} ({data.time})</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Inbound:
          </span>
          <span className="font-bold text-gray-900 tabular-nums">
            {isPieces ? `${data.inbound_qty.toLocaleString()} pcs` : `৳${formatBDT(data.inbound_val)}`}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-amber-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Outbound:
          </span>
          <span className="font-bold text-gray-900 tabular-nums">
            {isPieces ? `${data.outbound_qty.toLocaleString()} pcs` : `৳${formatBDT(data.outbound_val)}`}
          </span>
        </div>
        <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Net Delta:</span>
          <span
            className={`font-bold tabular-nums ${
              (isPieces ? data.net_qty : data.net_val) >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {isPieces
              ? `${data.net_qty > 0 ? "+" : ""}${data.net_qty.toLocaleString()} pcs`
              : `${data.net_val > 0 ? "+" : ""}৳${formatBDT(data.net_val)}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export const WarehouseStockMovementChart = ({
  pharmacyId,
  locationId,
}: WarehouseStockMovementChartProps) => {
  const [metricType, setMetricType] = useState<"pieces" | "value">("pieces");
  const [chartData, setChartData] = useState<MovementPoint[]>(generateEmpty24HourBuckets());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const fetchStockMovement = useCallback(async () => {
    if (!pharmacyId || !locationId) return;

    try {
      // 1. Primary: High-performance PostgreSQL RPC
      const { data, error } = await supabase.rpc(
        "get_warehouse_stock_movement" as any,
        {
          p_pharmacy_id: pharmacyId,
          p_location_id: locationId,
        }
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped: MovementPoint[] = data.map((d: any) => {
          const h = Number(d.hour_index ?? d.hour ?? 0);
          const inQty = Number(d.inbound_qty || 0);
          const inVal = Number(d.inbound_val || 0);
          const outQty = Number(d.outbound_qty || 0);
          const outVal = Number(d.outbound_val || 0);
          return {
            hour: h,
            label: d.hour_bucket || d.label || (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`),
            time: d.time || `${String(h).padStart(2, "0")}:00`,
            inbound_qty: inQty,
            inbound_val: inVal,
            outbound_qty: outQty,
            outbound_val: outVal,
            net_qty: inQty - outQty,
            net_val: inVal - outVal,
          };
        });
        setChartData(mapped);
        return;
      }

      // 2. Resilient client-side fallback if RPC not yet deployed to remote instance
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [transfersRes, allPOs] = await Promise.all([
        supabase
          .from("stock_transfers" as any)
          .select("from_location_id, to_location_id, quantity, accepted_at, status, medicine_id")
          .eq("pharmacy_id", pharmacyId)
          .eq("status", "accepted")
          .gte("accepted_at", todayStart.toISOString()),
        warehouseStorage.getPurchaseOrders(pharmacyId),
      ]);

      const transfers = transfersRes.data ?? [];
      const receivedPOs = (allPOs ?? []).filter(
        (po) =>
          po.status === "received" &&
          (!po.warehouse_id || String(po.warehouse_id) === String(locationId)) &&
          po.received_at &&
          new Date(po.received_at) >= todayStart
      );

      const buckets = generateEmpty24HourBuckets();

      // Aggregate Outbound & Inbound Stock Transfers
      for (const t of transfers as any[]) {
        if (!t.accepted_at) continue;
        const dt = new Date(t.accepted_at);
        const h = dt.getHours();
        if (h >= 0 && h < 24) {
          const qty = Number(t.quantity || 0);
          const estVal = qty * 45; // Default estimation baseline

          if (String(t.to_location_id) === String(locationId)) {
            buckets[h].inbound_qty += qty;
            buckets[h].inbound_val += estVal;
          }
          if (String(t.from_location_id) === String(locationId)) {
            buckets[h].outbound_qty += qty;
            buckets[h].outbound_val += estVal;
          }
        }
      }

      // Aggregate Inbound Supplier GRN Deliveries (Purchase Orders)
      for (const po of receivedPOs as any[]) {
        if (!po.received_at) continue;
        const dt = new Date(po.received_at);
        const h = dt.getHours();
        if (h >= 0 && h < 24) {
          const poVal = Number(po.total_amount || 0);
          // Estimate pieces based on average ৳45/unit or default proportional units
          const poQty = poVal > 0 ? Math.round(poVal / 45) : 50;
          buckets[h].inbound_qty += poQty;
          buckets[h].inbound_val += poVal;
        }
      }

      for (let h = 0; h < 24; h++) {
        buckets[h].net_qty = buckets[h].inbound_qty - buckets[h].outbound_qty;
        buckets[h].net_val = buckets[h].inbound_val - buckets[h].outbound_val;
      }

      setChartData(buckets);
    } catch (err) {
      console.warn("[WarehouseDashboard] Error fetching stock movement:", err);
      setChartData(generateEmpty24HourBuckets());
    }
  }, [pharmacyId, locationId]);

  useEffect(() => {
    fetchStockMovement();
  }, [fetchStockMovement]);

  // Realtime subscription strictly isolated to stock_transfers for this pharmacy
  useEffect(() => {
    if (!pharmacyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchStockMovement(), 300);
    };

    const channel = supabase
      .channel(`warehouse-movement-${pharmacyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_transfers",
          filter: `pharmacy_id=eq.${pharmacyId}`,
        },
        debounced
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medicines",
          filter: `pharmacy_id=eq.${pharmacyId}`,
        },
        debounced
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [pharmacyId, fetchStockMovement]);

  const handlePointClick = (data: any) => {
    if (!data?.activePayload?.length) return;
    const point = data.activePayload[0].payload as MovementPoint;
    setModalData(point);
    setModalOpen(true);
  };

  const totalInbound = chartData.reduce(
    (sum, p) => sum + (metricType === "pieces" ? p.inbound_qty : p.inbound_val),
    0
  );
  const totalOutbound = chartData.reduce(
    (sum, p) => sum + (metricType === "pieces" ? p.outbound_qty : p.outbound_val),
    0
  );

  const formattedInbound =
    metricType === "pieces" ? `${totalInbound.toLocaleString()} pcs` : `৳${formatBDT(totalInbound)}`;
  const formattedOutbound =
    metricType === "pieces" ? `${totalOutbound.toLocaleString()} pcs` : `৳${formatBDT(totalOutbound)}`;

  // Cloned chart scroll container geometry
  const chartWidth = Math.max(500, chartData.length * 28);

  return (
    <div className="px-5 pt-3 pb-6">
      <Card className="border-0 shadow-sm rounded-3xl bg-card p-4">
        {/* Header with Title and Volume/Value Toggle */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Today's Stock Movement</h2>
            <p className="text-[11px] text-muted-foreground">Inbound (Stock In) vs Outbound (Dispatches)</p>
          </div>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setMetricType("pieces")}
              className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                metricType === "pieces"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pieces
            </button>
            <button
              type="button"
              onClick={() => setMetricType("value")}
              className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                metricType === "value"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Value (৳)
            </button>
          </div>
        </div>

        {/* Legend pills matching retail aesthetics */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="font-medium text-emerald-800">Inbound: {formattedInbound}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span className="font-medium text-amber-800">Outbound: {formattedOutbound}</span>
          </div>
        </div>

        {/* Dual-line Spline Chart */}
        <div className="chart-scroll-container overflow-x-auto -ml-2">
          <div style={{ width: chartWidth, minHeight: 192 }}>
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={chartData} onClick={handlePointClick}>
                <defs>
                  <linearGradient id="inboundGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="outboundGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  interval={2}
                />
                <YAxis hide />
                <Tooltip content={<CustomMovementTooltip metricType={metricType} />} />
                <Area
                  type="monotone"
                  dataKey={metricType === "pieces" ? "inbound_qty" : "inbound_val"}
                  name="Inbound"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fill="url(#inboundGradient)"
                  dot={{ r: 3, fill: "#10B981", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#10B981", stroke: "#fff", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey={metricType === "pieces" ? "outbound_qty" : "outbound_val"}
                  name="Outbound"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  fill="url(#outboundGradient)"
                  dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#F59E0B", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Hourly Detail Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-2xl max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Stock Movement — {modalData?.label} ({modalData?.time})
            </DialogTitle>
          </DialogHeader>
          {modalData ? (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-[11px] font-medium text-emerald-700">Inbound Received</p>
                  <p className="text-lg font-bold text-emerald-900 mt-0.5">
                    {modalData.inbound_qty.toLocaleString()} pcs
                  </p>
                  <p className="text-[10px] text-emerald-600">৳{formatBDT(modalData.inbound_val)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                  <p className="text-[11px] font-medium text-amber-700">Outbound Dispatched</p>
                  <p className="text-lg font-bold text-amber-900 mt-0.5">
                    {modalData.outbound_qty.toLocaleString()} pcs
                  </p>
                  <p className="text-[10px] text-amber-600">৳{formatBDT(modalData.outbound_val)}</p>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Net Flow</span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    modalData.net_qty >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {modalData.net_qty > 0 ? "+" : ""}
                  {modalData.net_qty.toLocaleString()} pcs (
                  {modalData.net_val > 0 ? "+" : ""}৳{formatBDT(modalData.net_val)})
                </span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
