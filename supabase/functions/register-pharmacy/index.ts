import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterRequest {
  shopName: string;
  fullName: string;
  phone: string;
  email: string;
  password: string;
  division: string;
  district: string;
  upazila: string;
  streetAddress?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RegisterRequest = await req.json();
    const { shopName, fullName, phone, email, password, division, district, upazila, streetAddress } = body;

    // Validate required fields
    if (!shopName || !fullName || !phone || !email || !password || !division || !district || !upazila) {
      return new Response(
        JSON.stringify({ error: "All required fields must be provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check pharmacy name uniqueness
    const { data: existing } = await supabaseAdmin
      .from("pharmacies")
      .select("id")
      .ilike("name", shopName)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: "A pharmacy with this name already exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create pharmacy
    const fullAddress = [streetAddress, upazila, district, division].filter(Boolean).join(", ");
    const { data: pharmacy, error: pharmacyError } = await supabaseAdmin
      .from("pharmacies")
      .insert({ name: shopName, address: fullAddress, division, district, upazila })
      .select("id")
      .single();

    if (pharmacyError) {
      return new Response(
        JSON.stringify({ error: "Failed to create pharmacy: " + pharmacyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      // Rollback pharmacy
      await supabaseAdmin.from("pharmacies").delete().eq("id", pharmacy.id);
      return new Response(
        JSON.stringify({ error: "Failed to create user: " + authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Update profile (created by trigger) with pharmacy_id, name, phone, role
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        pharmacy_id: pharmacy.id,
        full_name: fullName,
        phone,
        role: "admin",
      })
      .eq("id", authData.user.id);

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    // 4. Sign in the user to get a session
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return new Response(
        JSON.stringify({ error: "Account created but auto-login failed. Please sign in manually." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        session: signInData.session,
        user: signInData.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error: " + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
