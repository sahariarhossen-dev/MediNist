import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PaymentRecord, SubscriptionInfo } from "@/lib/subscriptionMock";
import { getStatus, type SubStatus } from "@/lib/subscriptionStatus";

/**
 * How the client resolved the subscription:
 * - "pending"     : nothing confirmed yet (initial load / retrying)
 * - "resolved"    : a real `pharmacies` row was read — the verdict is trustworthy
 * - "no-pharmacy" : the signed-in user genuinely has no pharmacy linked
 * - "unresolved"  : reads came back empty or errored — never lock the user out
 */
export type SubResolution = "pending" | "resolved" | "no-pharmacy" | "unresolved";

const RETRY_DELAYS = [400, 1200];

export interface SubscriptionState {
  sub: SubscriptionInfo | null;
  payments: PaymentRecord[];
  loading: boolean;
  refetch: () => Promise<void>;
  pharmacyId: string | null;
  lastPopupShown: string | null;
  status: SubStatus;
  resolution: SubResolution;
  /** True only when the server confirmed an expired subscription. */
  isExpired: boolean;
  isTrial: boolean;
}

const buildSub = (row: {
  subscription_plan: string | null;
  subscription_started_at: string | null;
  subscription_expiry: string;
}): SubscriptionInfo => {
  const startedAt = row.subscription_started_at ?? row.subscription_expiry;
  const expiry = row.subscription_expiry;
  const totalDays = Math.max(
    1,
    Math.round((new Date(expiry).getTime() - new Date(startedAt).getTime()) / 86_400_000),
  );
  return {
    plan: row.subscription_plan ?? "Pharmacy Pro",
    started_at: startedAt,
    expiry_date: expiry,
    total_days: totalDays,
  };
};

/** Trial window for a real pharmacy row that has no explicit expiry set yet. */
const buildTrialSub = (createdAt?: string | null): SubscriptionInfo => {
  const startIso = createdAt ?? new Date().toISOString();
  const expiry = new Date(new Date(startIso).getTime() + 30 * 86_400_000);
  return {
    plan: "Free Trial",
    started_at: startIso,
    expiry_date: expiry.toISOString(),
    total_days: 30,
  };
};

export function useSubscriptionState(): SubscriptionState {
  const { user, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [lastPopupShown, setLastPopupShown] = useState<string | null>(null);
  const [resolution, setResolution] = useState<SubResolution>("pending");
  const [loading, setLoading] = useState(true);
  const runId = useRef(0);

  const load = useCallback(
    async (attempt = 0): Promise<void> => {
      const myRun = ++runId.current;
      const stale = () => myRun !== runId.current;

      // No session yet: stay unresolved (never expired) and wait.
      if (!user?.id) {
        if (!authLoading) {
          setResolution("unresolved");
          setLoading(false);
        }
        return;
      }

      const retry = () => {
        const delay = RETRY_DELAYS[attempt];
        if (delay === undefined) {
          if (!stale()) {
            setResolution("unresolved");
            setLoading(false);
          }
          return;
        }
        setTimeout(() => {
          if (myRun === runId.current) void load(attempt + 1);
        }, delay);
      };

      try {
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("pharmacy_id")
          .eq("id", user.id)
          .maybeSingle();
        if (stale()) return;

        // Empty/errored profile read right after login is almost always the auth
        // header or RLS not being ready — retry instead of guessing.
        if (profErr || !prof) {
          retry();
          return;
        }

        const pid = prof.pharmacy_id ?? null;
        setPharmacyId(pid);

        if (!pid) {
          setSub(null);
          setPayments([]);
          setLastPopupShown(null);
          setResolution("no-pharmacy");
          setLoading(false);
          return;
        }

        const [pharmRes, paysRes] = await Promise.all([
          supabase
            .from("pharmacies")
            .select(
              "subscription_plan, subscription_started_at, subscription_expiry, last_popup_shown, created_at",
            )
            .eq("id", pid)
            .maybeSingle(),
          supabase
            .from("subscription_payments")
            .select("id, created_at, amount_bdt, duration_days, status")
            .eq("pharmacy_id", pid)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        if (stale()) return;

        const pharm = pharmRes.data as
          | {
              subscription_plan: string | null;
              subscription_started_at: string | null;
              subscription_expiry: string | null;
              last_popup_shown: string | null;
              created_at: string | null;
            }
          | null;

        if (pharmRes.error || !pharm) {
          retry();
          return;
        }

        setSub(
          pharm.subscription_expiry
            ? buildSub({
                subscription_plan: pharm.subscription_plan,
                subscription_started_at: pharm.subscription_started_at,
                subscription_expiry: pharm.subscription_expiry,
              })
            : buildTrialSub(pharm.created_at),
        );
        setLastPopupShown(pharm.subscription_expiry ? pharm.last_popup_shown ?? null : null);
        setPayments(
          (paysRes.data ?? []).map((p) => ({
            id: p.id as string,
            date: p.created_at as string,
            amount_bdt: Number(p.amount_bdt),
            duration_days: p.duration_days as number,
            status: p.status as "success" | "pending",
          })),
        );
        setResolution("resolved");
        setLoading(false);
      } catch (err) {
        console.error("useSubscription load failed:", err);
        if (!stale()) retry();
      }
    },
    [user?.id, authLoading],
  );

  const refetch = useCallback(async () => {
    await load(0);
  }, [load]);

  // Refetch whenever the session appears or is refreshed (token readiness).
  useEffect(() => {
    void load(0);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void load(0);
    });
    return () => subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (!pharmacyId) return;
    const ch = supabase
      .channel(`sub-${pharmacyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pharmacies", filter: `id=eq.${pharmacyId}` },
        () => void load(0),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_payments",
          filter: `pharmacy_id=eq.${pharmacyId}`,
        },
        () => void load(0),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [pharmacyId, load]);

  const status: SubStatus = getStatus(sub, payments);

  return {
    sub,
    payments,
    loading: loading || authLoading,
    refetch,
    pharmacyId,
    lastPopupShown,
    status,
    resolution,
    // Only a confirmed pharmacy row can lock the app.
    isExpired: resolution === "resolved" && status === "expired",
    isTrial: resolution === "resolved" && status === "trial",
  };
}
