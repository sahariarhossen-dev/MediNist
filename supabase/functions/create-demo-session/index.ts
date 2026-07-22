import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_TTL_HOURS = 4;

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const suffix = randomId();
  const email = `demo_${suffix}@demo.medinist.app`;
  const password = crypto.randomUUID() + "!Aa9";
  const expiresAt = new Date(Date.now() + DEMO_TTL_HOURS * 3600 * 1000).toISOString();
  const farFutureExpiry = new Date(Date.now() + 365 * 86400 * 1000).toISOString();

  let pharmacyId: string | null = null;
  let userId: string | null = null;

  try {
    // 1. Pharmacy
    const { data: pharm, error: pErr } = await admin
      .from("pharmacies")
      .insert({
        name: `Demo Pharmacy ${suffix.slice(0, 6).toUpperCase()}`,
        address: "Dhanmondi, Dhaka",
        division: "Dhaka",
        district: "Dhaka",
        upazila: "Dhanmondi",
        is_demo: true,
        demo_expires_at: expiresAt,
        subscription_expiry: farFutureExpiry,
        subscription_plan: "Demo",
      })
      .select("id")
      .single();
    if (pErr || !pharm) throw new Error(`pharmacy: ${pErr?.message}`);
    pharmacyId = pharm.id;

    // 2. Auth user
    const { data: auth, error: aErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { demo: true },
    });
    if (aErr || !auth?.user) throw new Error(`auth: ${aErr?.message}`);
    userId = auth.user.id;

    // 3. Seed data (also promotes the profile to admin, sets is_demo, terms)
    const { error: seedErr } = await admin.rpc("seed_demo_pharmacy", {
      _pharmacy_id: pharmacyId,
      _user_id: userId,
    });
    if (seedErr) throw new Error(`seed: ${seedErr.message}`);

    // 4. Sign in with anon client
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (sErr || !signIn?.session) throw new Error(`signin: ${sErr?.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        session: signIn.session,
        user: signIn.user,
        expires_at: expiresAt,
        pharmacy_id: pharmacyId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-demo-session failed:", err);
    // Rollback
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
    if (pharmacyId) {
      try { await admin.from("pharmacies").delete().eq("id", pharmacyId); } catch {}
    }
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Failed to create demo session" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});