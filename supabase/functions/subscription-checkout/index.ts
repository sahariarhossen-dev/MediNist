import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Server-side plan catalog. The client may only pick a plan key — never
// the number of days or the amount charged.
const PLANS: Record<string, { days: number; amount: number; label: string }> = {
  monthly: { days: 30, amount: 500, label: "Pharmacy Pro — 1 Month" },
};

const GATEWAYS = new Set(["bkash", "nagad", "rocket", "card"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  try {
    // 1. Identify the caller from their JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const planKey = typeof body.planKey === "string" ? body.planKey : "monthly";
    const gateway = typeof body.gateway === "string" ? body.gateway : "";
    const plan = PLANS[planKey];
    if (!plan) return json({ error: "Unknown plan" }, 400);
    if (!GATEWAYS.has(gateway)) return json({ error: "Unsupported payment method" }, 400);

    // 2. Only a pharmacy admin can pay for their own pharmacy.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("pharmacy_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.pharmacy_id) return json({ error: "No pharmacy linked to your account" }, 400);
    if (profile.role !== "admin") {
      return json({ error: "Only pharmacy admins can renew the subscription" }, 403);
    }

    // 3. Payment verification hook.
    // Real gateway confirmation must happen here (server-to-server call or
    // webhook signature check) before the subscription is extended. Until a
    // live gateway is wired up, this sandbox mode is gated by a secret so it
    // cannot be triggered by end users.
    const sandboxAllowed = Deno.env.get("SUBSCRIPTION_SANDBOX_MODE") === "true";
    const providerRef = typeof body.providerRef === "string" ? body.providerRef.slice(0, 100) : null;

    if (!sandboxAllowed) {
      return json(
        { error: "Payment gateway not configured. Please contact support to activate your plan." },
        503,
      );
    }

    // 4. Extend using server-defined days/amount only.
    const { data: newExpiry, error: rpcErr } = await admin.rpc("extend_subscription_admin", {
      _pharmacy_id: profile.pharmacy_id,
      _user_id: user.id,
      _days: plan.days,
      _amount: plan.amount,
      _provider: gateway,
      _invoice_id: providerRef,
    });
    if (rpcErr) {
      console.error("subscription-checkout: extend failed:", rpcErr.message);
      return json({ error: "Could not extend your subscription. Please try again." }, 400);
    }

    return json({
      success: true,
      plan: plan.label,
      days: plan.days,
      amount: plan.amount,
      subscription_expiry: newExpiry,
    });
  } catch (err) {
    console.error("subscription-checkout error", err);
    return json({ error: "Checkout failed. Please try again." }, 500);
  }
});