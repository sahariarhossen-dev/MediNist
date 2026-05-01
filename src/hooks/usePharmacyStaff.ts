import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StaffMember {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  last_seen: string | null;
}

export const usePharmacyStaff = () => {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.rpc("get_pharmacy_member_presence");
      if (active && data) {
        setStaff(
          (data as StaffMember[]).filter((s) => s.user_id !== user?.id)
        );
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  return { staff, loading };
};