import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { shopName, fullName, phone, email, password, division, district, upazila, streetAddress } = body;

    // Validate required fields
    if (!shopName || !fullName || !phone || !email || !password || !division || !district || !upazila) {
      return new Response(
        JSON.stringify({ error: "All required fields must be provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Input validation
    const strFields = { shopName, fullName, phone, division, district, upazila };
    for (const [key, val] of Object.entries(strFields)) {
      if (typeof val !== "string" || val.trim().length === 0 || val.length > 255) {
        return new Response(
          JSON.stringify({ error: `Invalid ${key}: must be a non-empty string under 255 characters` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (streetAddress !== undefined && (typeof streetAddress !== "string" || streetAddress.length > 500)) {
      return new Response(
        JSON.stringify({ error: "Street address must be under 500 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== "string" || !emailRegex.test(email) || email.length > 255) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Password validation
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      return new Response(
        JSON.stringify({ error: "Password must be between 6 and 128 characters" }),
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
      .ilike("name", shopName.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: "A pharmacy with this name already exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create pharmacy
    const trimmedShopName = shopName.trim();
    const trimmedFullName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedStreetAddress = streetAddress?.trim();
    const fullAddress = [trimmedStreetAddress, upazila.trim(), district.trim(), division.trim()].filter(Boolean).join(", ");

    const { data: pharmacy, error: pharmacyError } = await supabaseAdmin
      .from("pharmacies")
      .insert({ name: trimmedShopName, address: fullAddress, division: division.trim(), district: district.trim(), upazila: upazila.trim() })
      .select("id")
      .single();

    if (pharmacyError) {
      console.error("register-pharmacy: pharmacy insert failed:", pharmacyError);
      return new Response(
        JSON.stringify({ error: `Failed to create pharmacy: ${pharmacyError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error("register-pharmacy: createUser failed:", authError);
      // Rollback pharmacy
      await supabaseAdmin.from("pharmacies").delete().eq("id", pharmacy.id);
      return new Response(
        JSON.stringify({ error: `Failed to create user account: ${authError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Update profile (created by trigger) with pharmacy_id, name, phone, role
    // The first user to register a pharmacy is its admin. We verify the role
    // landed correctly and roll back the whole signup if it didn't, so an
    // owner never gets stuck as 'salesman'.
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        pharmacy_id: pharmacy.id,
        full_name: trimmedFullName,
        phone: trimmedPhone,
        role: "admin",
      })
      .eq("id", authData.user.id)
      .select("id, role, pharmacy_id")
      .maybeSingle();

    if (profileError || !updatedProfile || updatedProfile.role !== "admin" || updatedProfile.pharmacy_id !== pharmacy.id) {
      console.error("Profile admin promotion failed:", profileError, updatedProfile);
      // Roll back: remove the auth user and the pharmacy so registration can be retried cleanly.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      await supabaseAdmin.from("pharmacies").delete().eq("id", pharmacy.id);
      return new Response(
        JSON.stringify({ error: "Failed to set up admin account. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Sign in the user with a normal (anon) client so we return a regular user session,
    //    not one tied to the service-role context.
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    let signInData: { session: unknown; user: unknown } | null = null;
    try {
      const result = await supabaseAnon.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error || !result.data.session) {
        console.error("register-pharmacy: auto sign-in failed:", result.error?.message);
        return new Response(
          JSON.stringify({ error: "Account created but auto-login failed. Please sign in manually." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      signInData = result.data;
    } catch (signInThrown) {
      console.error("register-pharmacy: auto sign-in threw:", signInThrown);
      return new Response(
        JSON.stringify({ error: "Account created but auto-login failed. Please sign in manually." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        session: signInData!.session,
        user: signInData!.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("register-pharmacy: unexpected error:", err);
    return new Response(
      JSON.stringify({ error: `An unexpected error occurred: ${(err as Error)?.message ?? "unknown"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
