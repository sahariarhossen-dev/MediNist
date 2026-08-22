import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { detectDevice, getSessionId } from "@/lib/deviceInfo";

const HEARTBEAT_MS = 60_000;
const REVOKE_CHECK_EVERY = 5; // heartbeats

/**
 * Silent background shift/screen-time tracking.
 * One interval + one visibility listener. Deltas accumulate in refs, so no
 * re-renders and nothing on the POS render path. Fire-and-forget RPC.
 */
export const useShiftTracker = () => {
  const { user, profile, signOut } = useAuth();
  const activeRef = useRef(0);
  const idleRef = useRef(0);
  const tickRef = useRef(0);
  const lastTsRef = useRef(Date.now());

  useEffect(() => {
    if (!user?.id || !profile?.pharmacy_id) return;

    const sessionId = getSessionId();
    const device = detectDevice();
    let cancelled = false;
    lastTsRef.current = Date.now();

    const accumulate = () => {
      const now = Date.now();
      const delta = Math.round((now - lastTsRef.current) / 1000);
      lastTsRef.current = now;
      if (delta <= 0) return;
      if (document.visibilityState === "visible") activeRef.current += delta;
      else idleRef.current += delta;
    };

    const onVisibility = () => accumulate();
    document.addEventListener("visibilitychange", onVisibility);

    const flush = async () => {
      accumulate();
      const active = activeRef.current;
      const idle = idleRef.current;
      activeRef.current = 0;
      idleRef.current = 0;
      try {
        await supabase.rpc("heartbeat_shift" as any, {
          _session_id: sessionId,
          _active_delta: active,
          _idle_delta: idle,
          _device: device as any,
        });
      } catch {
        /* never block the app on telemetry */
      }

      tickRef.current += 1;
      if (tickRef.current % REVOKE_CHECK_EVERY === 0) {
        try {
          const { data } = await supabase.rpc("is_my_session_revoked" as any, {
            _session_id: sessionId,
          });
          if (data === true && !cancelled) await signOut();
        } catch {}
      }
    };

    void flush();
    const interval = window.setInterval(() => void flush(), HEARTBEAT_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.pharmacy_id]);
};
