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
  const { user, profile } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile?.pharmacy_id) {
        setStaff([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_pharmacy_member_presence");
        if (active && !error && data && Array.isArray(data)) {
          setStaff(
            (data as StaffMember[]).filter((s) => s.user_id !== user?.id)
          );
          setLoading(false);
          return;
        }

        // Direct scoped fallback query on public.profiles
        const { data: directProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, role, last_seen")
          .eq("pharmacy_id", profile.pharmacy_id)
          .neq("id", user?.id || "");

        if (active && directProfiles) {
          setStaff(
            directProfiles.map((p) => ({
              user_id: p.id,
              full_name: p.full_name,
              avatar_url: p.avatar_url,
              role: p.role,
              last_seen: p.last_seen,
            }))
          );
        }
      } catch (err) {
        console.warn("[usePharmacyStaff] Error fetching staff:", err);
        if (active) setStaff([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, profile?.pharmacy_id]);

  return { staff, loading };
};