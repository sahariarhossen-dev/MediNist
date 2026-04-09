import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Verify caller identity
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

    // Check caller is admin
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

    const { email, role } = await req.json();
    if (!email || !role || !["owner", "manager", "salesman"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid email or role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send invitation email
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (inviteError && !inviteError.message.includes("already been registered")) {
      console.error("Invite error:", inviteError.message);
      return new Response(JSON.stringify({ error: "Failed to send invitation. Please try again." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert into shop_staff
    const { error: insertError } = await adminClient.from("shop_staff").upsert(
      {
        pharmacy_id: profile.pharmacy_id,
        email,
        role,
        status: "pending",
        invited_by: user.id,
      },
      { onConflict: "pharmacy_id,email" }
    );

    if (insertError) {
      console.error("Insert error:", insertError.message);
      return new Response(JSON.stringify({ error: "Failed to register staff invitation. Please try again." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: `Invitation sent to ${email}!` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err.message);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
