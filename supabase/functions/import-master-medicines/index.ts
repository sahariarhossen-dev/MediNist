import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Allowlist of super-admin user IDs allowed to run the master import.
// Add your auth.users UUID here.
const SUPER_ADMIN_USER_IDS: string[] = [
  // "your-uuid-here",
];

interface RawRow {
  brand_name?: unknown;
  generic_name?: unknown;
  strength?: unknown;
  unit_price?: unknown;
  company?: unknown;
  format?: unknown;
  pack_size?: unknown;
  box_size?: unknown;
}

const asString = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

const asStrength = (v: unknown): string => {
  const s = asString(v);
  if (!s || s.toUpperCase() === "N/A") return "N/A";
  return s;
};

const asPrice = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    if (!SUPER_ADMIN_USER_IDS.includes(userId)) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          hint: "Add your auth user ID to SUPER_ADMIN_USER_IDS in supabase/functions/import-master-medicines/index.ts",
          your_user_id: userId,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) {
      return new Response(JSON.stringify({ error: "Body must be { rows: [], truncate?: boolean }" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rows: RawRow[] = body.rows;
    if (rows.length === 0 || rows.length > 200) {
      return new Response(JSON.stringify({ error: "rows length must be 1..200" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let truncated = false;
    if (body.truncate === true) {
      const { error: delErr } = await admin
        .from("master_medicines")
        .delete()
        .not("id", "is", null);
      if (delErr) {
        return new Response(JSON.stringify({ error: "Truncate failed", detail: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      truncated = true;
    }

    const mapped = rows
      .map((r) => {
        const brand = asString(r.brand_name);
        if (!brand) return null;
        return {
          brand_name: brand,
          generic_name: asString(r.generic_name),
          strength: asStrength(r.strength),
          unit_price: asPrice(r.unit_price),
          company: asString(r.company),
          format: asString(r.format),
          pack_size: asString(r.pack_size),
          box_size: asString(r.box_size),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (mapped.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, truncated, skipped: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await admin.from("master_medicines").insert(mapped);
    if (insErr) {
      return new Response(JSON.stringify({ error: "Insert failed", detail: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ inserted: mapped.length, truncated, skipped: rows.length - mapped.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});