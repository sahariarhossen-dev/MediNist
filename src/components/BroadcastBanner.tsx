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
        .select("id, message, created_at")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) {
        setBroadcast(data[0] as unknown as Broadcast);
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

  return (
    <div className="mx-page mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3 shadow-sm">
      <div className="p-1.5 rounded-lg bg-amber-100 shrink-0">
        <Megaphone size={16} className="text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-0.5">Notice</p>
        <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">{broadcast.message}</p>
      </div>
      <button
        onClick={dismiss}
        className="p-1 rounded-lg hover:bg-amber-100 shrink-0"
        aria-label="Dismiss notice"
      >
        <X size={14} className="text-amber-700" />
      </button>
    </div>
  );
};

export default BroadcastBanner;