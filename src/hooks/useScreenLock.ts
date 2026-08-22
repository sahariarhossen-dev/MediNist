import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SecuritySettings {
  pin_lock_enabled: boolean;
  grace_seconds: number;
}

/**
 * Smart minimize lock. Nothing unmounts and nothing reloads — the overlay is a
 * sibling of the app tree, so an in-progress sale survives the lock.
 * A grace period keeps quick tab switches during POS billing friction-free.
 */
export const useScreenLock = () => {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase
        .from("staff_security_settings" as any)
        .select("pin_lock_enabled, grace_seconds")
        .eq("pharmacy_id", profile.pharmacy_id)
        .maybeSingle(),
      supabase.rpc("has_staff_pin" as any),
    ]);
    const row = (s as any) || null;
    setSettings(
      row
        ? { pin_lock_enabled: !!row.pin_lock_enabled, grace_seconds: Number(row.grace_seconds ?? 60) }
        : { pin_lock_enabled: false, grace_seconds: 60 },
    );
    setHasPin(p === true);
  }, [profile?.pharmacy_id]);

  useEffect(() => {
    if (!user?.id || !profile?.pharmacy_id) return;
    void refresh();
  }, [user?.id, profile?.pharmacy_id, refresh]);

  // Ask for a PIN once the owner turns the lock on and the member has none yet.
  useEffect(() => {
    setNeedsSetup(!!settings?.pin_lock_enabled && hasPin === false);
  }, [settings?.pin_lock_enabled, hasPin]);

  useEffect(() => {
    if (!settings?.pin_lock_enabled || !hasPin) return;

    const clear = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clear();
        timerRef.current = window.setTimeout(
          () => setLocked(true),
          Math.max(5, settings.grace_seconds) * 1000,
        );
      } else {
        clear();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clear();
    };
  }, [settings?.pin_lock_enabled, settings?.grace_seconds, hasPin]);

  const unlock = useCallback(() => setLocked(false), []);
  const onPinCreated = useCallback(() => {
    setHasPin(true);
    setNeedsSetup(false);
  }, []);

  return { locked, unlock, needsSetup, onPinCreated, settings, refresh };
};
