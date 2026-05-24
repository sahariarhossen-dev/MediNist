import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Allowlist of super-admin user IDs allowed to run the master import.
const SUPER_ADMIN_USER_IDS: string[] = [
  "41f9a774-97ea-41a6-8da7-6137b5c5c970",
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[import-master-medicines] request received", req.method);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: missing bearer token" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      console.log("[import-master-medicines] auth.getUser failed:", userErr?.message);
      return json({ error: `Unauthorized: ${userErr?.message ?? "no user"}` }, 401);
    }

    const userId = userData.user.id;
    if (!SUPER_ADMIN_USER_IDS.includes(userId)) {
      return json({
        error: "Forbidden",
        hint: "Add your auth user ID to SUPER_ADMIN_USER_IDS",
        your_user_id: userId,
      }, 403);
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: `Invalid JSON body: ${String(e)}` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Dedicated truncate action — keeps slow DELETE in its own request so it doesn't
    // share the timeout budget of the first insert batch.
    if (body?.action === "truncate") {
      console.log("[import-master-medicines] truncating master_medicines");
      const { error: delErr } = await admin
        .from("master_medicines")
        .delete()
        .not("id", "is", null);
      if (delErr) {
        console.log("[import-master-medicines] truncate failed:", delErr.message);
        return json({ error: `Truncate failed: ${delErr.message}` }, 500);
      }
      return json({ truncated: true });
    }

    if (!body || !Array.isArray(body.rows)) {
      return json({ error: "Body must be { rows: [...] } or { action: 'truncate' }" }, 400);
    }
    const rows: RawRow[] = body.rows;
    if (rows.length === 0 || rows.length > 500) {
      return json({ error: `rows length must be 1..500 (got ${rows.length})` }, 400);
    }

    let truncated = false;
    if (body.truncate === true) {
      const { error: delErr } = await admin
        .from("master_medicines")
        .delete()
        .not("id", "is", null);
      if (delErr) {
        console.log("[import-master-medicines] inline truncate failed:", delErr.message);
        return json({ error: `Truncate failed: ${delErr.message}` }, 500);
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
      return json({ inserted: 0, truncated, skipped: rows.length });
    }

    const { error: insErr } = await admin.from("master_medicines").insert(mapped);
    if (insErr) {
      console.log("[import-master-medicines] insert failed:", insErr.message);
      return json({ error: `Insert failed: ${insErr.message}`, sample: mapped[0] }, 500);
    }

    return json({ inserted: mapped.length, truncated, skipped: rows.length - mapped.length });
  } catch (e) {
    console.log("[import-master-medicines] server error:", String(e));
    return json({ error: `Server error: ${String(e)}` }, 500);
  }
});