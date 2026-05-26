import { useCallback, useEffect, useState } from "react";
import { startOfDay, endOfDay } from "date-fns";
import { Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  user_id: string;
  full_name: string;
  total: number;
}

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const rangeLabelMap: Record<string, string> = {
  today: "Today",
  "7days": "Last 7 Days",
  "15days": "Last 15 Days",
  "30days": "Last 30 Days",
};

function getRangeStart(range: string): Date {
  const d = new Date();
  switch (range) {
    case "7days": d.setDate(d.getDate() - 7); return d;
    case "15days": d.setDate(d.getDate() - 15); return d;
    case "30days": d.setDate(d.getDate() - 30); return d;
    default: return startOfDay(d);
  }
}

const TopSalesPerformers = ({
  pharmacyId,
  timeRange = "today",
}: {
  pharmacyId: string | undefined;
  timeRange?: string;
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!pharmacyId) return;
    const from = getRangeStart(timeRange).toISOString();
    const to = endOfDay(new Date()).toISOString();

    const [salesRes, namesRes] = await Promise.all([
      supabase
        .from("sales")
        .select("user_id,total")
        .eq("pharmacy_id", pharmacyId)
        .eq("status", "completed")
        .gte("created_at", from)
        .lte("created_at", to),
      supabase.rpc("get_pharmacy_member_names"),
    ]);

    const nameMap = new Map<string, string>();
    (namesRes.data ?? []).forEach((m: any) =>
      nameMap.set(m.user_id, m.full_name || "Teammate"),
    );

    const totals = new Map<string, number>();
    (salesRes.data ?? []).forEach((s: any) => {
      totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + Number(s.total || 0));
    });

    const aggregated: Row[] = Array.from(totals.entries())
      .map(([user_id, total]) => ({
        user_id,
        full_name: nameMap.get(user_id) || "Teammate",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    setRows(aggregated);
    setLoading(false);
  }, [pharmacyId, timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!pharmacyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchData, 300);
    };
    const channel = supabase
      .channel(`top-performers-${pharmacyId}`)
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
  }, [pharmacyId, fetchData]);

  if (!pharmacyId) return null;

  const renderRank = (rank: number) => {
    if (rank === 1) return <Crown size={20} className="text-yellow-500 fill-yellow-500" />;
    if (rank === 2) return <Crown size={20} className="text-gray-400 fill-gray-400" />;
    return (
      <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
        {rank}
      </span>
    );
  };

  return (
    <div className="px-page py-3">
      <Card className="p-4 border-0 shadow-sm rounded-xl bg-white">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-fluid-base font-bold text-gray-900">Top Sales Performers</h2>
          <span className="text-fluid-xs text-muted-foreground">{rangeLabelMap[timeRange] ?? "Today"}</span>
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
        ) : rows.length === 0 ? (
          <p className="text-fluid-xs text-muted-foreground text-center py-4">
            No sales data yet for this range
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r, i) => (
              <li key={r.user_id} className="flex items-center gap-3">
                <div className="w-6 flex justify-center shrink-0">{renderRank(i + 1)}</div>
                <span className="flex-1 min-w-0 truncate text-fluid-sm font-medium text-gray-900">
                  {r.full_name}
                </span>
                <span className="text-fluid-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                  ৳{formatBDT(r.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default TopSalesPerformers;