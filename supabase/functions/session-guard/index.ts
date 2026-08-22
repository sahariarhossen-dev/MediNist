import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clientIp = (req: Request): string =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.headers.get("cf-connecting-ip") ||
  "";

const hashIp = async (ip: string, salt: string): Promise<string> => {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authed.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("pharmacy_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.pharmacy_id) return json({ error: "No shop linked to this account" }, 400);

    const ip = clientIp(req);
    const ip_hash = ip ? await hashIp(ip, profile.pharmacy_id as string) : null;

    let body: { action?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { data: settings } = await admin
      .from("staff_security_settings")
      .select("ip_restriction_enabled, allowed_ip_hashes")
      .eq("pharmacy_id", profile.pharmacy_id)
      .maybeSingle();

    if (body.action === "whoami") {
      if (profile.role !== "admin") return json({ error: "Only shop owners can read this" }, 403);
      return json({ ip_hash });
    }

    // Default action: check whether this network is allowed to use the shop.
    const restricted = !!settings?.ip_restriction_enabled;
    const allowed: string[] = (settings?.allowed_ip_hashes as string[]) || [];
    const ok = !restricted || allowed.length === 0 || (!!ip_hash && allowed.includes(ip_hash));

    return json({ allowed: ok, restricted, is_owner: profile.role === "admin" });
  } catch (_err) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
