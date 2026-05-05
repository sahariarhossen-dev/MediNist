import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function verifyAndExtend(invoiceId: string) {
  const base = (Deno.env.get("UDDOKTAPAY_BASE_URL") ?? "https://sandbox.uddoktapay.com").replace(/\/$/, "");
  const apiKey = Deno.env.get("UDDOKTAPAY_API_KEY")!;

  const resp = await fetch(`${base}/api/verify-payment`, {
    method: "POST",
    headers: {
      "RT-UDDOKTAPAY-API-KEY": apiKey,
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, status: "error", message: data?.message ?? "Verify failed" };
  }
  if (String(data?.status).toUpperCase() !== "COMPLETED") {
    return { ok: false, status: data?.status ?? "PENDING", message: "Payment not completed" };
  }

  const meta = data.metadata ?? {};
  const pharmacyId: string | undefined = meta.pharmacy_id;
  const userId: string | undefined = meta.user_id;
  const days = Number(meta.days ?? 30);
  const amount = Number(data.amount ?? 0);

  if (!pharmacyId || !userId) {
    return { ok: false, status: "error", message: "Missing metadata in payment" };
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency
  const { data: existing } = await admin
    .from("subscription_payments")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (existing) {
    const { data: ph } = await admin
      .from("pharmacies")
      .select("subscription_expiry")
      .eq("id", pharmacyId)
      .maybeSingle();
    return { ok: true, alreadyProcessed: true, new_expiry: ph?.subscription_expiry ?? null };
  }

  const { data: ph } = await admin
    .from("pharmacies")
    .select("subscription_expiry, subscription_started_at")
    .eq("id", pharmacyId)
    .maybeSingle();

  const now = new Date();
  const current = ph?.subscription_expiry ? new Date(ph.subscription_expiry) : now;
  const base2 = current.getTime() > now.getTime() ? current : now;
  const newExpiry = new Date(base2.getTime() + days * 86_400_000).toISOString();

  await admin
    .from("pharmacies")
    .update({
      subscription_expiry: newExpiry,
      subscription_started_at: ph?.subscription_started_at ?? now.toISOString(),
    })
    .eq("id", pharmacyId);

  await admin.from("subscription_payments").insert({
    pharmacy_id: pharmacyId,
    user_id: userId,
    amount_bdt: amount,
    duration_days: days,
    status: "success",
    provider: "uddoktapay",
    invoice_id: invoiceId,
    metadata: data,
  });

  return { ok: true, alreadyProcessed: false, new_expiry: newExpiry };
}