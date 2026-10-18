import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  checkUserSuspension,
  forceTerminateSession,
  SUSPENSION_STORAGE_KEY,
} from "@/lib/accountSuspension";

export type UserRole = "owner" | "manager" | "salesman";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  pharmacy_id: string | null;
  role: UserRole | string | null;
  avatar_url: string | null;
  is_demo?: boolean | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  pharmacyName: string | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  isDemo: boolean;
  isSuspended: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  verifySuspension: (userId?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  pharmacyName: null,
  loading: true,
  isPasswordRecovery: false,
  isDemo: false,
  isSuspended: false,
  signOut: async () => {},
  refreshProfile: async () => {},
  verifySuspension: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pharmacyName, setPharmacyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const isTerminatingRef = useRef(false);

  const terminateSuspendedSession = useCallback(async (reason?: string | null, suspendedAt?: string | null) => {
    if (isTerminatingRef.current) return;
    isTerminatingRef.current = true;
    setIsSuspended(true);
    await forceTerminateSession({
      reason: reason || null,
      suspendedAt: suspendedAt || null,
      redirect: true,
    });
    setUser(null);
    setProfile(null);
    setPharmacyName(null);
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileData) {
        const rawRole = (profileData.role || "").toLowerCase().trim();
        const normalizedRole: UserRole =
          rawRole === "owner" || rawRole === "admin"
            ? "owner"
            : rawRole === "manager"
            ? "manager"
            : "salesman";

        const normalizedProfile: Profile = {
          ...(profileData as Profile),
          role: normalizedRole,
        };

        setProfile(normalizedProfile);
        if (profileData.pharmacy_id) {
          const { data: pharmacy } = await supabase
            .from("pharmacies")
            .select("name")
            .eq("id", profileData.pharmacy_id)
            .maybeSingle();
          setPharmacyName(pharmacy?.name ?? null);
        }
      }
    } catch (err) {
      console.warn("[AuthContext] Error fetching profile:", err);
    }
  }, []);

  const verifySuspension = useCallback(async (userId?: string): Promise<boolean> => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return false;

    try {
      const status = await checkUserSuspension(targetUserId);
      if (status.isSuspended) {
        await terminateSuspendedSession(status.reason, status.suspendedAt);
        return true;
      }
      setIsSuspended(false);
      return false;
    } catch (err) {
      console.warn("[AuthContext] Error in verifySuspension:", err);
      return false;
    }
  }, [user?.id, terminateSuspendedSession]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const suspended = await verifySuspension(user.id);
      if (!suspended) {
        await fetchProfile(user.id);
      }
    }
  }, [user?.id, fetchProfile, verifySuspension]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          if (event === "PASSWORD_RECOVERY") {
            setIsPasswordRecovery(true);
          }
          if (session?.user) {
            setLoading(true);
            const suspended = await verifySuspension(session.user.id);
            if (!suspended) {
              setUser(session.user);
              setTimeout(() => {
                fetchProfile(session.user.id).catch((err) =>
                  console.warn("[AuthContext] Deferred fetchProfile error:", err)
                );
              }, 0);
            } else {
              setUser(null);
              setProfile(null);
              setPharmacyName(null);
            }
          } else {
            setUser(null);
            setProfile(null);
            setPharmacyName(null);
          }
        } catch (authErr) {
          console.warn("[AuthContext] onAuthStateChange error:", authErr);
        } finally {
          setLoading(false);
        }
      }
    );

    supabase.auth
      .getSession()
      .then(async (res) => {
        const session = res?.data?.session;
        if (session?.user) {
          const suspended = await verifySuspension(session.user.id);
          if (!suspended) {
            setUser(session.user);
            await fetchProfile(session.user.id);
          } else {
            setUser(null);
            setProfile(null);
            setPharmacyName(null);
          }
        }
      })
      .catch((err) => {
        console.warn("[AuthContext] getSession error:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [fetchProfile, verifySuspension]);

  // Realtime Listeners for Immediate Session Termination & Foreground Resumption
  useEffect(() => {
    if (!user?.id) return;

    const currentUserId = user.id;
    const currentPharmacyId = profile?.pharmacy_id;

    // 1. Direct user security channel (broadcast)
    const userChannel = supabase.channel(`user_security_${currentUserId}`, {
      config: { broadcast: { self: true } },
    })
      .on("broadcast", { event: "account_suspended" }, async (payload: any) => {
        const data = payload?.payload || payload || {};
        if (data.is_suspended ?? data.isSuspended) {
          await terminateSuspendedSession(
            data.reason || null,
            data.suspended_at || data.suspendedAt || null
          );
        }
      })
      .subscribe();

    // 2. Pharmacy staff broadcast channel
    let pharmacyChannel: any = null;
    if (currentPharmacyId) {
      pharmacyChannel = supabase.channel(`staff_suspension_shop_${currentPharmacyId}`, {
        config: { broadcast: { self: true } },
      })
        .on("broadcast", { event: "staff_suspension_change" }, async (payload: any) => {
          const data = payload?.payload || payload || {};
          if (
            (data.userId === currentUserId || data.user_id === currentUserId) &&
            (data.isSuspended || data.is_suspended)
          ) {
            await terminateSuspendedSession(
              data.reason || null,
              data.suspended_at || data.suspendedAt || null
            );
          }
        })
        .subscribe();
    }

    // 3. Postgres changes listener across membership tables
    const dbChannel = supabase.channel(`suspension_db_${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_access",
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload: any) => {
          const row = payload.new || {};
          if (row.is_suspended === true) {
            await terminateSuspendedSession(row.suspend_reason || null, row.suspended_at || null);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shop_staff",
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload: any) => {
          const row = payload.new || {};
          if (row.is_suspended === true || row.status === "suspended") {
            await terminateSuspendedSession(row.suspend_reason || null, null);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${currentUserId}`,
        },
        async (payload: any) => {
          const row = payload.new || {};
          if (row.is_suspended === true || row.status === "suspended") {
            await terminateSuspendedSession(null, null);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shop_members",
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload: any) => {
          const row = payload.new || {};
          if (row.is_suspended === true || row.status === "suspended") {
            await terminateSuspendedSession(null, null);
          }
        }
      )
      .subscribe();

    // 4. Foreground resume and window focus verification
    const handleResumeOrFocus = () => {
      verifySuspension(currentUserId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        verifySuspension(currentUserId);
      }
    };

    // 5. Cross-tab storage events
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SUSPENSION_STORAGE_KEY && e.newValue) {
        try {
          const notice = JSON.parse(e.newValue);
          terminateSuspendedSession(notice.reason, notice.suspendedAt);
        } catch {}
      }
    };

    window.addEventListener("focus", handleResumeOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    // 6. Periodic heartbeat verification (every 15 seconds)
    const heartbeatId = setInterval(() => {
      verifySuspension(currentUserId);
    }, 15000);

    return () => {
      supabase.removeChannel(userChannel);
      if (pharmacyChannel) supabase.removeChannel(pharmacyChannel);
      supabase.removeChannel(dbChannel);
      window.removeEventListener("focus", handleResumeOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
      clearInterval(heartbeatId);
    };
  }, [user?.id, profile?.pharmacy_id, verifySuspension, terminateSuspendedSession]);

  const signOut = async () => {
    const demoPharmacyId = profile?.is_demo ? profile.pharmacy_id : null;
    if (demoPharmacyId) {
      try {
        const base = `https://hjqcvidezzzkfipcneit.supabase.co/functions/v1/cleanup-demo-sessions`;
        await fetch(`${base}?pharmacy_id=${demoPharmacyId}`, { method: "POST" });
      } catch {}
    }
    localStorage.removeItem("medinist_demo");
    localStorage.removeItem("medinist_active_location_id");
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("warehouse_") || k.startsWith("medinist_active_"))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}

    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[AuthContext] signOut network error caught:", e);
    }
    setUser(null);
    setProfile(null);
    setPharmacyName(null);
    setIsSuspended(false);
    isTerminatingRef.current = false;
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      pharmacyName,
      loading,
      isPasswordRecovery,
      isDemo: !!profile?.is_demo,
      isSuspended,
      signOut,
      refreshProfile,
      verifySuspension,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
