import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Clock, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface WarehouseRecentDispatchesProps {
  pharmacyId: string | null | undefined;
  locationId: string | null | undefined;
}

interface DispatchItem {
  id: string;
  medicine_name: string;
  quantity: number;
  unit: string;
  status: string;
  target_location_name: string;
  accepted_at: string | null;
  created_at: string;
}

interface ExpiringItem {
  id: string;
  name: string;
  stock_quantity: number;
  expiry_date: string;
  days_left: number;
}

export const WarehouseRecentDispatches = ({
  pharmacyId,
  locationId,
}: WarehouseRecentDispatchesProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"dispatches" | "expiring">("dispatches");
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [expiring, setExpiring] = useState<ExpiringItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!pharmacyId || !locationId) return;

    try {
      // 1. Fetch Location names map for displaying branch targets
      const { data: locData } = await supabase
        .from("shop_locations" as any)
        .select("id, name")
        .eq("pharmacy_id", pharmacyId);

      const locMap = new Map<string, string>();
      (locData ?? []).forEach((loc: any) => locMap.set(String(loc.id), loc.name));

      // 2. Fetch Recent Dispatches / Transfers from this warehouse
      const { data: transfers } = await supabase
        .from("stock_transfers" as any)
        .select("id, medicine_name, quantity, unit, status, to_location_id, accepted_at, created_at")
        .eq("pharmacy_id", pharmacyId)
        .eq("from_location_id", String(locationId))
        .order("created_at", { ascending: false })
        .limit(5);

      const mappedTransfers: DispatchItem[] = (transfers ?? []).map((t: any) => ({
        id: t.id,
        medicine_name: t.medicine_name || "Medicine Batch",
        quantity: Number(t.quantity || 0),
        unit: t.unit || "pcs",
        status: t.status || "pending",
        target_location_name: locMap.get(String(t.to_location_id)) || "Branch Outlet",
        accepted_at: t.accepted_at,
        created_at: t.created_at,
      }));
      setDispatches(mappedTransfers);

      // 3. Fetch Expiring Batches in this warehouse within 60 days
      const in60Days = new Date();
      in60Days.setDate(in60Days.getDate() + 60);

      const { data: meds } = await supabase
        .from("medicines")
        .select("id, name, stock_quantity, expiry_date")
        .eq("pharmacy_id", pharmacyId)
        .eq("location_id", locationId)
        .gt("stock_quantity", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", in60Days.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true })
        .limit(5);

      const today = new Date();
      const mappedExpiring: ExpiringItem[] = (meds ?? []).map((m: any) => {
        const exp = new Date(m.expiry_date);
        const diffTime = exp.getTime() - today.getTime();
        const days_left = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
          id: m.id,
          name: m.name,
          stock_quantity: Number(m.stock_quantity || 0),
          expiry_date: m.expiry_date,
          days_left: Math.max(0, days_left),
        };
      });
      setExpiring(mappedExpiring);
    } catch (err) {
      console.warn("[WarehouseDashboard] Error fetching recent dispatches/expiring:", err);
    } finally {
      setLoading(false);
    }
  }, [pharmacyId, locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription strictly isolated to stock_transfers & medicines
  useEffect(() => {
    if (!pharmacyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchData, 300);
    };

    const channel = supabase
      .channel(`warehouse-dispatches-${pharmacyId}`)
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
  }, [pharmacyId, fetchData]);

  if (!pharmacyId) return null;

  return (
    <div className="px-page py-3">
      <Card className="p-4 border-0 shadow-sm rounded-xl bg-white">
        {/* Header strictly mirroring Retail TopSalesPerformers */}
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-fluid-base font-bold text-gray-900">
              {activeTab === "dispatches" ? "Recent Dispatches" : "Expiring Soon Batches"}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("dispatches")}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                activeTab === "dispatches"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dispatches
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("expiring")}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                activeTab === "expiring"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Expiring
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : activeTab === "dispatches" ? (
          dispatches.length === 0 ? (
            <div className="text-center py-5">
              <p className="text-fluid-xs text-muted-foreground">No recent dispatches logged</p>
              <button
                type="button"
                onClick={() => navigate("/inventory")}
                className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
              >
                Create new transfer in Inventory &rarr;
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {dispatches.map((r, i) => {
                const isAccepted = r.status === "accepted";
                return (
                  <li
                    key={r.id}
                    onClick={() => navigate("/inventory")}
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/80 p-1.5 -mx-1.5 rounded-lg transition-colors"
                  >
                    <div className="w-6 flex justify-center shrink-0">
                      {isAccepted ? (
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <CheckCircle2 size={14} />
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                          <Truck size={13} />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-fluid-sm font-medium text-gray-900">
                        {r.medicine_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        &rarr; {r.target_location_name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-fluid-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {r.quantity} {r.unit}
                      </span>
                      <p className="text-[10px] font-medium capitalize text-slate-500">
                        {isAccepted ? (
                          <span className="text-emerald-600">Dispatched</span>
                        ) : (
                          <span className="text-amber-600">Pending</span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : expiring.length === 0 ? (
          <div className="text-center py-5">
            <p className="text-fluid-xs text-muted-foreground">No batches expiring within 60 days</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {expiring.map((m) => (
              <li
                key={m.id}
                onClick={() => navigate("/inventory")}
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/80 p-1.5 -mx-1.5 rounded-lg transition-colors"
              >
                <div className="w-6 flex justify-center shrink-0">
                  <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                    <Clock size={13} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-fluid-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-[11px] text-rose-600 font-medium truncate">
                    {m.days_left === 0 ? "Expires today" : `${m.days_left} days left`} ({m.expiry_date})
                  </p>
                </div>
                <span className="text-fluid-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                  {m.stock_quantity.toLocaleString()} pcs
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Quick action link to Inventory / Transfers */}
        <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">Manage Warehouse Stock</span>
          <button
            type="button"
            onClick={() => navigate("/inventory")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            Inventory Logistics <ArrowUpRight size={13} />
          </button>
        </div>
      </Card>
    </div>
  );
};
