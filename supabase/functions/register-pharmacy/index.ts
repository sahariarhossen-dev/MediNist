import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Abuse prevention: cap how many pharmacies a single client IP can create.
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || "unknown").trim();
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`medinist:${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Lightweight shop-name availability check for the signup wizard.
    // Runs with the service role so the `pharmacies` table stays private.
    if (body?.action === "check_name") {
      const name = typeof body.shopName === "string" ? body.shopName.trim() : "";
      if (name.length < 2 || name.length > 255) {
        return new Response(JSON.stringify({ error: "Invalid shop name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const nameAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: existing } = await nameAdmin
        .from("pharmacies")
        .select("id")
        .ilike("name", name)
        .limit(1);
      return new Response(JSON.stringify({ available: !(existing && existing.length > 0) }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { shopName, fullName, phone, email, password, division, district, upazila, streetAddress, terms_accepted } = body;

    if (terms_accepted !== true) {
      return new Response(
        JSON.stringify({ error: "You must agree to the Terms of Service and Privacy Policy." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Server-side rate limit per client IP
    const ipHash = await hashIp(clientIp(req));
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentAttempts } = await supabaseAdmin
      .from("registration_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);

    if ((recentAttempts ?? 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: "Too many registration attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin
      .from("registration_attempts")
      .insert({ ip_hash: ipHash, email: email.trim().toLowerCase() });

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
        JSON.stringify({ error: "Failed to create pharmacy. Please try again." }),
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
      // Only surface the allow-listed "already registered" case; everything
      // else returns a generic message so internal details stay in the logs.
      const authMsg = (authError.message ?? "").toLowerCase();
      const alreadyExists =
        authMsg.includes("already") || authMsg.includes("registered") || authMsg.includes("exists");
      return new Response(
        JSON.stringify({
          error: alreadyExists
            ? "An account with this email already exists. Please sign in instead."
            : "Failed to create user account. Please try again.",
        }),
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
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
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
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
