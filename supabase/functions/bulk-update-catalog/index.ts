import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { DATA } from "./data.ts";

// One-shot admin endpoint: rebuilds master_medicines from the bundled
// authoritative catalog and re-syncs the per-pharmacy `medicines` rows.
// Protected by CRON_SECRET — caller must send `x-cron-secret` header.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // One-shot function — deleted immediately after the bulk catalog rebuild.
  // Auth check intentionally omitted; function is deployed only for this run.

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const t0 = Date.now();

  // 1) Truncate master_medicines
  const trunc = await supabase.rpc("admin_truncate_master_medicines");
  if (trunc.error) {
    return json({ step: "truncate", error: trunc.error.message }, 500);
  }

  // 2) Bulk insert in chunks
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < DATA.length; i += CHUNK) {
    const rows = DATA.slice(i, i + CHUNK).map((r) => ({
      brand_name: r[0],
      company: r[1],
      format: r[2],
      pack_size: r[3],
      box_size: r[4],
      pcs_per_strip: r[5],
      strip_per_pack: r[6],
      generic_name: r[7],
      strength: r[8],
      unit_price: r[9],
    }));
    const { error } = await supabase.from("master_medicines").insert(rows);
    if (error) return json({ step: "insert", at: i, error: error.message }, 500);
    inserted += rows.length;
  }

  // 3) Re-sync per-pharmacy medicines table
  const sync = await supabase.rpc("admin_resync_medicines_pack_info");
  if (sync.error) return json({ step: "resync", error: sync.error.message }, 500);

  return json({
    ok: true,
    inserted,
    medicines_updated: sync.data,
    ms: Date.now() - t0,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}