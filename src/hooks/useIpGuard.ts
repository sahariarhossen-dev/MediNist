import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

/**
 * Optional shop-network restriction. Runs once per app load (not per route), so
 * it adds no cost to POS or inventory work. Owners are never locked out.
 */
export const useIpGuard = () => {
  const { user, profile, signOut } = useAuth();
  const checked = useRef(false);

  useEffect(() => {
    if (!user?.id || !profile?.pharmacy_id || checked.current) return;
    checked.current = true;

    void (async () => {
      try {
        const { data } = await supabase.functions.invoke("session-guard", { body: {} });
        const res = data as any;
        if (res && res.allowed === false && res.is_owner === false) {
          toast({
            title: "Outside the shop network",
            description: "Your owner restricted access to the shop Wi-Fi.",
            variant: "destructive",
          });
          await signOut();
        }
      } catch {
        /* never block sign-in on a network check failure */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.pharmacy_id]);
};
