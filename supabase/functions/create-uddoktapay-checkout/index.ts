import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    const email = userData.user.email ?? "user@medinist.app";

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, pharmacy_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.pharmacy_id) return json({ error: "No pharmacy linked to user" }, 400);

    const body = await req.json().catch(() => ({}));
    const days = Number(body?.days ?? 30);
    const amount = Number(body?.amount ?? 2000);
    const appUrl: string = body?.app_url ?? req.headers.get("origin") ?? "";

    const rawBase = Deno.env.get("UDDOKTAPAY_BASE_URL") ?? "https://panel.uddoktapay.com";
    const match = rawBase.match(/https?:\/\/[^\s\])]+/);
    const base = (match ? match[0] : "https://panel.uddoktapay.com")
      .replace(/\/+$/, "")
      .replace(/\/api$/, "");
    const apiKey = Deno.env.get("UDDOKTAPAY_API_KEY")!;
    const projectRef = (Deno.env.get("SUPABASE_URL") ?? "").match(/https:\/\/([^.]+)/)?.[1];
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/uddoktapay-webhook`;

    const payload = {
      full_name: profile.full_name || "MediNist User",
      email,
      amount: String(amount),
      metadata: {
        order_id: `sub_${Date.now()}`,
        user_id: userId,
        pharmacy_id: profile.pharmacy_id,
        days: String(days),
      },
      redirect_url: `${appUrl}/subscription/payment-return`,
      cancel_url: `${appUrl}/subscription?cancelled=1`,
      webhook_url: webhookUrl,
      return_type: "GET",
    };

    const resp = await fetch(`${base}/api/checkout-v2`, {
      method: "POST",
      headers: {
        "RT-UDDOKTAPAY-API-KEY": apiKey,
        "Api-Key": apiKey,
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.payment_url) {
      console.error("UddoktaPay create failed", { status: resp.status, base, data });
      return json({ error: data?.message ?? "Failed to create checkout", details: data }, 502);
    }

    return json({ payment_url: data.payment_url, invoice_id: data.invoice_id ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}