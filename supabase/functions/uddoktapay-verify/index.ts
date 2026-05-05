import { verifyAndExtend } from "../_shared/uddoktapay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const invoiceId = body?.invoice_id ?? url.searchParams.get("invoice_id");
    if (!invoiceId) return json({ error: "invoice_id required" }, 400);
    const result = await verifyAndExtend(String(invoiceId));
    return json(result, result.ok ? 200 : 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}