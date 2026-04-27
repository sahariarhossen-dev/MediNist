import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  pharmacy_id: string | null;
  role: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  pharmacyName: string | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  pharmacyName: null,
  loading: true,
  isPasswordRecovery: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pharmacyName, setPharmacyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileData) {
      setProfile(profileData as Profile);
      if (profileData.pharmacy_id) {
        const { data: pharmacy } = await supabase
          .from("pharmacies")
          .select("name")
          .eq("id", profileData.pharmacy_id)
          .single();
        setPharmacyName(pharmacy?.name ?? null);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
        }
        if (session?.user) {
          setUser(session.user);
          setTimeout(() => fetchProfile(session.user.id), 0);
          if (event === "SIGNED_IN") {
            // Best-effort presence + login log
            setTimeout(() => {
              supabase.rpc("touch_last_seen").then(() => {});
              // Log login event (requires pharmacy_id, deferred until profile loads)
              supabase
                .from("profiles")
                .select("pharmacy_id")
                .eq("id", session.user.id)
                .single()
                .then(({ data }) => {
                  if (data?.pharmacy_id) {
                    supabase.from("staff_activity_logs").insert({
                      pharmacy_id: data.pharmacy_id,
                      user_id: session.user.id,
                      action_type: "login",
                      description: "Signed in",
                    });
                  }
                });
            }, 100);
          }
        } else {
          setUser(null);
          setProfile(null);
          setPharmacyName(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
        supabase.rpc("touch_last_seen").then(() => {});
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Presence heartbeat: ping last_seen every 60s while tab visible, and on visibility change.
  useEffect(() => {
    if (!user?.id) return;
    const ping = () => {
      if (document.visibilityState === "visible") {
        supabase.rpc("touch_last_seen").then(() => {});
      }
    };
    ping();
    const interval = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [user?.id]);

  const signOut = async () => {
    // Best-effort logout log before clearing the session
    if (user?.id && profile?.pharmacy_id) {
      await supabase.from("staff_activity_logs").insert({
        pharmacy_id: profile.pharmacy_id,
        user_id: user.id,
        action_type: "logout",
        description: "Signed out",
      });
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setPharmacyName(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, pharmacyName, loading, isPasswordRecovery, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
