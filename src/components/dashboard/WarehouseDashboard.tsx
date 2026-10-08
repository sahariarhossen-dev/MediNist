import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, Truck, AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { WarehouseStockMovementChart } from "./WarehouseStockMovementChart";
import { WarehouseRecentDispatches } from "./WarehouseRecentDispatches";

interface WarehouseKpis {
  total_inventory_value: number;
  pending_dispatches: number;
  short_items_count: number;
  expiring_soon_count: number;
}

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

export const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeLocation } = useLocationStore();

  const [kpis, setKpis] = useState<WarehouseKpis>({
    total_inventory_value: 0,
    pending_dispatches: 0,
    short_items_count: 0,
    expiring_soon_count: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchKpis = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const locationId = activeLocation?.id;
    if (!pharmacyId || !locationId) return;

    try {
      // 1. Primary: Server-side PostgreSQL Stored Procedure (RPC)
      const { data, error } = await supabase.rpc(
        "get_warehouse_kpis" as any,
        {
          p_pharmacy_id: pharmacyId,
          p_location_id: locationId,
          p_expiry_days: 60,
        }
      );

      if (!error && data && typeof data === "object") {
        setKpis({
          total_inventory_value: Number((data as any).total_inventory_value || 0),
          pending_dispatches: Number((data as any).pending_dispatches || 0),
          short_items_count: Number((data as any).short_items_count || 0),
          expiring_soon_count: Number((data as any).expiring_soon_count || 0),
        });
        setLoading(false);
        return;
      }

      // 2. Resilient client-side fallback if RPC not yet deployed
      const in60Days = new Date();
      in60Days.setDate(in60Days.getDate() + 60);

      const [medsRes, transfersRes] = await Promise.all([
        supabase
          .from("medicines")
          .select("id, stock_quantity, price, stock_alert, expiry_date")
          .eq("pharmacy_id", pharmacyId)
          .eq("location_id", locationId),
        supabase
          .from("stock_transfers" as any)
          .select("id")
          .eq("pharmacy_id", pharmacyId)
          .eq("from_location_id", String(locationId))
          .eq("status", "pending"),
      ]);

      const meds = medsRes.data ?? [];
      const pendingCount = (transfersRes.data ?? []).length;

      let totalVal = 0;
      let shortCount = 0;
      let expiringCount = 0;
      const todayStr = new Date().toISOString().split("T")[0];
      const maxExpiryStr = in60Days.toISOString().split("T")[0];

      for (const m of meds as any[]) {
        const qty = Number(m.stock_quantity || 0);
        const price = Number(m.price || 0);
        const alert = Number(m.stock_alert ?? 10);
        
        // Value estimated at wholesale purchase cost (88% of unit MRP)
        totalVal += qty * (price * 0.88);

        if (qty <= alert) {
          shortCount += 1;
        }

        if (qty > 0 && m.expiry_date) {
          if (m.expiry_date >= todayStr && m.expiry_date <= maxExpiryStr) {
            expiringCount += 1;
          }
        }
      }

      setKpis({
        total_inventory_value: totalVal,
        pending_dispatches: pendingCount,
        short_items_count: shortCount,
        expiring_soon_count: expiringCount,
      });
    } catch (err) {
      console.warn("[WarehouseDashboard] Error fetching warehouse KPIs:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.pharmacy_id, activeLocation?.id]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  // Realtime: Listen ONLY to stock_transfers and medicines tables
  // Zero subscriptions to sales or cash_transactions (complete isolation)
  useEffect(() => {
    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchKpis();
      }, 300);
    };

    const filter = `pharmacy_id=eq.${pharmacyId}`;
    const channel = supabase
      .channel(`warehouse-kpis-${pharmacyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_transfers", filter }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "medicines", filter }, debounced)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [profile?.pharmacy_id, fetchKpis]);

  // Exact 4 KPI Cards matching Retail Dashboard specifications
  const kpiCards = [
    {
      title: "Total Inventory Value",
      value: `৳${formatBDT(kpis.total_inventory_value)}`,
      icon: Wallet,
      color: "bg-blue-100 text-blue-600",
      onClick: () => navigate("/inventory"),
    },
    {
      title: "Pending Dispatches",
      value: `${kpis.pending_dispatches} Transfers`,
      icon: Truck,
      color: "bg-purple-100 text-purple-600",
      onClick: () => navigate("/stock-movements?view=outbound"),
    },
    {
      title: "Short Items",
      value: String(kpis.short_items_count),
      icon: AlertTriangle,
      color: "bg-orange-100 text-orange-500",
      onClick: () => navigate("/short-items"),
    },
    {
      title: "Expiring Soon",
      value: String(kpis.expiring_soon_count),
      icon: Clock,
      color: "bg-amber-100 text-amber-600",
      onClick: () => navigate("/inventory"),
    },
  ];

  return (
    <>
      {/* Warehouse Header - Exactly mirrors retail "Business Insights" typography & padding */}
      <div className="px-page pt-3 pb-2">
        <div className="flex items-start justify-between pt-[10px] pb-[5px]">
          <div>
            <h1 className="text-fluid-lg font-bold text-gray-900">
              Warehouse Operations Overview
            </h1>
            <p className="text-fluid-xs mt-0.5 text-secondary-foreground">
              {activeLocation.name || "Central Godown"} — Storage & Supply Chain Logistics
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-fluid-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            Godown Hub
          </span>
        </div>
      </div>

      {/* 4 Fast-Action KPI Cards */}
      <div className="grid grid-cols-2 gap-3 px-page py-3">
        {kpiCards.map((card) => (
          <Card
            key={card.title}
            className={`p-4 border-0 shadow-sm rounded-xl bg-white ${
              card.onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""
            }`}
            onClick={card.onClick}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon size={18} />
            </div>
            <p className="text-fluid-xs font-medium text-muted-foreground">{card.title}</p>
            <p className="text-fluid-xl font-bold text-gray-900 mt-0.5 tabular-nums truncate">
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Dual-Line Spline Chart: Inbound vs Outbound Movements */}
      <WarehouseStockMovementChart
        pharmacyId={profile?.pharmacy_id}
        locationId={activeLocation?.id}
      />

      {/* Recent Dispatches / Expiring Batches List */}
      <WarehouseRecentDispatches
        pharmacyId={profile?.pharmacy_id}
        locationId={activeLocation?.id}
      />
    </>
  );
};

export default WarehouseDashboard;
