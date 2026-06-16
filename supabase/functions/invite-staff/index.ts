import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = Deno.env.get("APP_URL") ?? "https://medinist.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, pharmacy_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin" || !profile.pharmacy_id) {
      return new Response(JSON.stringify({ error: "Only admins can invite staff" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(rawEmail) || rawEmail.length > 255) {
      console.error("Invalid email payload:", JSON.stringify(rawEmail));
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["owner", "manager", "salesman"].includes(role)) {
      console.error("Invalid role payload:", JSON.stringify(role));
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pharmacy name for the email
    const { data: pharmacy } = await adminClient
      .from("pharmacies")
      .select("name")
      .eq("id", profile.pharmacy_id)
      .single();
    const pharmacyName = pharmacy?.name ?? "your pharmacy";

    // Generate fresh token + 7 day expiry
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Upsert invitation — re-inviting refreshes token, expiry, and resets status
    const { error: upsertError } = await adminClient.from("shop_staff").upsert(
      {
        pharmacy_id: profile.pharmacy_id,
        email: rawEmail,
        role,
        status: "pending",
        invited_by: user.id,
        token,
        expires_at: expiresAt,
        accepted_at: null,
        user_id: null,
      },
      { onConflict: "pharmacy_id,email" }
    );

    if (upsertError) {
      console.error("Upsert error:", upsertError.message);
      return new Response(JSON.stringify({ error: "Failed to record invitation." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send branded email via Lovable transactional email infrastructure.
    // If email infra isn't set up yet, the invocation will fail — we still
    // return success with the link so the admin can share it manually.
    const acceptUrl = `${APP_URL}/accept-invitation?token=${token}`;

    return new Response(
      JSON.stringify({
        success: true,
        emailSent: false,
        acceptUrl,
        email: rawEmail,
        role,
        pharmacyName,
        message: `Invitation link generated for ${rawEmail}. Copy and share it manually.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
