import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Reads the signed-in member's remote-lock (read-only) state.
 * The DB is the real gate — this only drives the banner and disabled CTAs.
 */
export const useReadOnlyLock = () => {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLocked(false);
      return;
    }
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("staff_access" as any)
        .select("is_read_only,read_only_reason")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      setLocked(Boolean((data as any)?.is_read_only));
      setReason(((data as any)?.read_only_reason as string) || null);
    };

    void load();

    const channel = supabase
      .channel(`staff-access-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_access", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { locked, reason };
};
