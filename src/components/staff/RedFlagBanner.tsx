import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AlertOctagon, ChevronRight } from "lucide-react";

/**
 * Today's high-risk count + instant alerting.
 * Tapping applies the "High risk" filter to the feed below.
 */
const RedFlagBanner = ({
  userFilter,
  refreshKey = 0,
  onSelect,
}: {
  userFilter: string;
  refreshKey?: number;
  onSelect: () => void;
}) => {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  const dayStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const load = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    let q = supabase
      .from("staff_activity_logs" as any)
      .select("id", { count: "exact", head: true })
      .eq("pharmacy_id", profile.pharmacy_id)
      .eq("severity", "high_risk")
      .gte("created_at", dayStart());
    if (userFilter !== "all") q = q.eq("user_id", userFilter);
    const { count: c } = await q;
    setCount(c ?? 0);
  }, [profile?.pharmacy_id, userFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Instant alert on new high-risk events
  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    const channel = supabase
      .channel(`activity-high-risk-${profile.pharmacy_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_activity_logs",
          filter: `pharmacy_id=eq.${profile.pharmacy_id}`,
        },
        (payload) => {
          const row = payload.new as { severity?: string; description?: string };
          if (row?.severity !== "high_risk") return;
          setCount((c) => c + 1);
          toast.error("High-risk activity detected", {
            description: row.description || "Open the Activity tab to review",
            duration: 8000,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.pharmacy_id]);

  const flagged = count > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-2 p-3 rounded-2xl border text-left transition ${
        flagged
          ? "bg-destructive/10 border-destructive/30"
          : "bg-card border-border"
      }`}
    >
      <AlertOctagon
        size={18}
        className={flagged ? "text-destructive shrink-0" : "text-muted-foreground shrink-0"}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">
          Today&apos;s Red Flags: <span className="tabular-nums">{count}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {flagged ? "Tap to review high-risk activity" : "No high-risk activity today"}
        </p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </button>
  );
};

export default RedFlagBanner;
