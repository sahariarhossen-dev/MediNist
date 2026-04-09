import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Check if already seeded
  const { count } = await supabase
    .from("master_medicines")
    .select("*", { count: "exact", head: true });

  if (count && count > 0) {
    return new Response(JSON.stringify({ message: `Already seeded with ${count} records` }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const medicines = body.medicines as Array<{
    brand_name: string;
    generic_name: string | null;
    strength: string | null;
    unit_price: number;
    company: string | null;
    format: string | null;
    pack_size: string | null;
    box_size: string | null;
  }>;

  if (!medicines || !Array.isArray(medicines)) {
    return new Response(JSON.stringify({ error: "medicines array required" }), { status: 400 });
  }

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < medicines.length; i += batchSize) {
    const batch = medicines.slice(i, i + batchSize);
    const { error } = await supabase.from("master_medicines").insert(batch);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, inserted }), { status: 500 });
    }
    inserted += batch.length;
  }

  return new Response(JSON.stringify({ success: true, inserted }), {
    headers: { "Content-Type": "application/json" },
  });
});
