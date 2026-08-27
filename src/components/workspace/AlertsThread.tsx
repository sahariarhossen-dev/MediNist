import { useEffect, useState } from "react";
import { Megaphone, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { relativeTime } from "@/lib/relativeTime";

export interface AlertRow {
  id: string;
  message: string;
  created_at: string;
  is_urgent: boolean | null;
}

export const useSystemAlerts = () => {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pharmacy_broadcasts")
        .select("id, message, created_at, is_urgent")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setAlerts((data ?? []) as AlertRow[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.pharmacy_id]);

  return { alerts, loading };
};

const AlertsThread = () => {
  const { alerts, loading } = useSystemAlerts();

  return (
    <div className="min-h-[calc(100vh-72px)] bg-slate-50 pb-28">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Megaphone className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900">System Alerts</h1>
          <p className="text-[11.5px] text-slate-500">Broadcasts and shop-wide notices</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && alerts.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">No active alerts.</p>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            className={
              "rounded-2xl border bg-white p-4 " +
              (a.is_urgent ? "border-red-200 bg-red-50/50" : "border-slate-200")
            }
          >
            <div className="mb-1 flex items-center gap-2">
              {a.is_urgent ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              ) : (
                <Megaphone className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span className="text-[11.5px] font-medium text-slate-500">
                {a.is_urgent ? "Urgent" : "Notice"} · {relativeTime(a.created_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">
              {a.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AlertsThread;
