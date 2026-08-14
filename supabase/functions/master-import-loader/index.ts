import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SRC = "https://medi-nist.lovable.app/__l5e/assets-v1/bf5e08c2-7e98-47f9-bd23-0081e7d56cab/master_clean.json";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const res = await fetch(SRC);
    if (!res.ok) throw new Error("source fetch failed");
    const rows = await res.json() as Record<string, unknown>[];

    await admin.rpc("truncate_master_import");

    const CH = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CH) {
      const { error } = await admin.from("master_medicines_import").insert(rows.slice(i, i + CH));
      if (error) throw new Error(`batch ${i}: ${error.message}`);
      inserted += Math.min(CH, rows.length - i);
    }

    return new Response(JSON.stringify({ ok: true, source_rows: rows.length, inserted }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("master-import-loader error", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
