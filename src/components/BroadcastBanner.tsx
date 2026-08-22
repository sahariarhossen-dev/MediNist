import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Broadcast {
  id: string;
  message: string;
  created_at: string;
  is_urgent?: boolean | null;
}

const DISMISS_KEY = "medinist:broadcast:dismissed";

const BroadcastBanner = () => {
  const { profile } = useAuth();
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pharmacy_broadcasts" as any)
        .select("id, message, created_at, is_urgent")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled && data && data.length > 0) {
        const rows = data as unknown as Broadcast[];
        const urgent = rows.find((r) => r.is_urgent);
        setBroadcast(urgent ?? rows[0]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.pharmacy_id]);

  if (!broadcast || dismissedId === broadcast.id) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, broadcast.id);
    } catch {}
    setDismissedId(broadcast.id);
  };

  const urgent = !!broadcast.is_urgent;

  return (
    <div
      className={`mx-page mt-3 rounded-2xl border px-4 py-3 flex items-start gap-3 shadow-sm ${
        urgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className={`p-1.5 rounded-lg shrink-0 ${urgent ? "bg-red-100" : "bg-amber-100"}`}>
        <Megaphone size={16} className={urgent ? "text-red-700" : "text-amber-700"} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
            urgent ? "text-red-700" : "text-amber-700"
          }`}
        >
          {urgent ? "Urgent Notice" : "Notice"}
        </p>
        <p className={`text-sm whitespace-pre-wrap break-words ${urgent ? "text-red-900" : "text-amber-900"}`}>
          {broadcast.message}
        </p>
      </div>
      <button
        onClick={dismiss}
        className={`p-1 rounded-lg shrink-0 ${urgent ? "hover:bg-red-100" : "hover:bg-amber-100"}`}
        aria-label="Dismiss notice"
      >
        <X size={14} className={urgent ? "text-red-700" : "text-amber-700"} />
      </button>
    </div>
  );
};


export default BroadcastBanner;