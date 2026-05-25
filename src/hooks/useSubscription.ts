import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentRecord, SubscriptionInfo } from "@/lib/subscriptionMock";
import { getStatus, type SubStatus } from "@/lib/subscriptionStatus";

export function useSubscription() {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [lastPopupShown, setLastPopupShown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const buildSub = useCallback(
    (row: { subscription_plan: string | null; subscription_started_at: string | null; subscription_expiry: string }): SubscriptionInfo => {
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
    },
    [],
  );

  const buildDefaultTrialSub = useCallback((createdAt?: string | null): SubscriptionInfo => {
    const startIso = createdAt ?? new Date().toISOString();
    const startMs = new Date(startIso).getTime();
    const expiry = new Date(startMs + 30 * 86_400_000);
    return {
      plan: "Free Trial",
      started_at: startIso,
      expiry_date: expiry.toISOString(),
      total_days: 30,
    };
  }, []);

  const refetch = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const createdAt = userData.user?.created_at ?? null;
      if (!uid) {
        setSub(buildDefaultTrialSub(createdAt));
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("pharmacy_id")
        .eq("id", uid)
        .maybeSingle();
      const pid = prof?.pharmacy_id ?? null;
      setPharmacyId(pid);
      if (!pid) {
        setSub(buildDefaultTrialSub(createdAt));
        setLastPopupShown(null);
        setPayments([]);
        return;
      }

      const [pharmRes, paysRes] = await Promise.all([
        supabase
          .from("pharmacies")
          .select("subscription_plan, subscription_started_at, subscription_expiry, last_popup_shown")
          .eq("id", pid)
          .maybeSingle(),
        supabase
          .from("subscription_payments")
          .select("id, created_at, amount_bdt, duration_days, status")
          .eq("pharmacy_id", pid)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const pharm = pharmRes.data as any;
      const pays = paysRes.data as any[] | null;

      if (pharm && pharm.subscription_expiry) {
        setSub(buildSub(pharm));
        setLastPopupShown((pharm.last_popup_shown as string | null) ?? null);
      } else {
        setSub(buildDefaultTrialSub(createdAt));
        setLastPopupShown(null);
      }
      setPayments(
        (pays ?? []).map((p: any) => ({
          id: p.id,
          date: p.created_at,
          amount_bdt: Number(p.amount_bdt),
          duration_days: p.duration_days,
          status: p.status as "success" | "pending",
        })),
      );
    } catch (err) {
      console.error("useSubscription refetch failed:", err);
      const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } as any }));
      setSub(buildDefaultTrialSub(userData?.user?.created_at ?? null));
    } finally {
      setLoading(false);
    }
  }, [buildSub, buildDefaultTrialSub]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!pharmacyId) return;
    const ch = supabase
      .channel(`sub-${pharmacyId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pharmacies", filter: `id=eq.${pharmacyId}` },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_payments", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [pharmacyId, refetch]);

  const status: SubStatus = getStatus(sub, payments);
  return { sub, payments, loading, refetch, pharmacyId, lastPopupShown, status, isTrial: status === "trial", isExpired: status === "expired" };
}
