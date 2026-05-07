import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentRecord, SubscriptionInfo } from "@/lib/subscriptionMock";
import { getStatus, type SubStatus } from "@/lib/subscriptionStatus";

export function useSubscription() {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const buildSub = useCallback(
    (row: { subscription_plan: string | null; subscription_started_at: string | null; subscription_expiry: string | null }): SubscriptionInfo => {
      const startedAt = row.subscription_started_at ?? new Date().toISOString();
      const expiry =
        row.subscription_expiry ??
        new Date(Date.now() + 30 * 86_400_000).toISOString();
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

  const refetch = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
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
      setLoading(false);
      return;
    }

    const [{ data: pharm }, { data: pays }] = await Promise.all([
      supabase
        .from("pharmacies")
        .select("subscription_plan, subscription_started_at, subscription_expiry")
        .eq("id", pid)
        .maybeSingle(),
      supabase
        .from("subscription_payments")
        .select("id, created_at, amount_bdt, duration_days, status")
        .eq("pharmacy_id", pid)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (pharm) setSub(buildSub(pharm as any));
    setPayments(
      (pays ?? []).map((p: any) => ({
        id: p.id,
        date: p.created_at,
        amount_bdt: Number(p.amount_bdt),
        duration_days: p.duration_days,
        status: p.status as "success" | "pending",
      })),
    );
    setLoading(false);
  }, [buildSub]);

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
  return { sub, payments, loading, refetch, pharmacyId, status, isTrial: status === "trial", isExpired: status === "expired" };
}
