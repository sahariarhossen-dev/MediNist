import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Two modes:
  //   - explicit ?pharmacy_id=... to kill a single demo tenant on exit (public)
  //   - x-cron-secret header to sweep all expired demos
  const url = new URL(req.url);
  const explicitId = url.searchParams.get("pharmacy_id");
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && cronSecret === Deno.env.get("CRON_SECRET");

  let targets: Array<{ id: string }> = [];
  if (explicitId) {
    const { data } = await admin
      .from("pharmacies")
      .select("id")
      .eq("id", explicitId)
      .eq("is_demo", true)
      .limit(1);
    targets = data ?? [];
  } else if (isCron) {
    const { data } = await admin
      .from("pharmacies")
      .select("id")
      .eq("is_demo", true)
      .lt("demo_expires_at", new Date().toISOString())
      .limit(100);
    targets = data ?? [];
  } else {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let cleaned = 0;
  for (const p of targets) {
    try {
      // Collect all users tied to this pharmacy
      const { data: profs } = await admin
        .from("profiles")
        .select("id")
        .eq("pharmacy_id", p.id);

      // Delete pharmacy-scoped rows (respects FKs cascading where present)
      const tables = [
        "sale_items", "sales", "customer_ledger", "customers",
        "cash_transactions", "daily_closings", "medicines",
        "ai_messages", "ai_conversations", "customer_prescriptions",
        "product_targets", "staff_settings", "staff_activity_logs",
        "pharmacy_broadcasts", "pharmacy_settings", "subscription_payments",
        "shop_staff", "chat_messages", "chat_room_members", "chat_rooms", "notes",
      ];
      for (const t of tables) {
        await admin.from(t).delete().eq("pharmacy_id", p.id).catch(() => {});
      }

      // Clear profile links and delete auth users
      for (const prof of profs ?? []) {
        await admin.from("profiles").delete().eq("id", prof.id).catch(() => {});
        await admin.auth.admin.deleteUser(prof.id).catch(() => {});
      }

      await admin.from("pharmacies").delete().eq("id", p.id);
      cleaned++;
    } catch (err) {
      console.error("cleanup failed for", p.id, err);
    }
  }

  return new Response(
    JSON.stringify({ success: true, cleaned }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});