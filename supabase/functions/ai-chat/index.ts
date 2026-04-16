import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_BASE = `You are MediNist's professional pharmacy assistant. Help with medicine inventory, sales, and pharmacy operations. Be concise, helpful, and use markdown formatting (lists, bold, tables) when useful. Always answer based on the LIVE pharmacy data provided in the context. If asked about something not in the context, say so politely.`;

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

async function buildPharmacyContext(supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    const [medsRes, salesRes, itemsRes] = await Promise.all([
      supabase
        .from("medicines")
        .select("name, company_name, stock_quantity, price, expiry_date, stock_alert")
        .order("stock_quantity", { ascending: true })
        .limit(50),
      supabase
        .from("sales")
        .select("id, total, created_at, sale_type, status")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("sale_items")
        .select("medicine_name, quantity, total_price, created_at")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(500),
    ]);

    const medicines = medsRes.data ?? [];
    const sales = salesRes.data ?? [];
    const items = itemsRes.data ?? [];

    const lowStock = medicines.filter(
      (m: any) => (m.stock_quantity ?? 0) <= (m.stock_alert ?? 0)
    );

    const totalRevenue30d = sales.reduce((s: number, x: any) => s + Number(x.total ?? 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter((s: any) => (s.created_at ?? "").startsWith(today));
    const todayRevenue = todaySales.reduce((s: number, x: any) => s + Number(x.total ?? 0), 0);

    // Top selling
    const tally = new Map<string, { qty: number; revenue: number }>();
    for (const it of items as any[]) {
      const cur = tally.get(it.medicine_name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity ?? 0);
      cur.revenue += Number(it.total_price ?? 0);
      tally.set(it.medicine_name, cur);
    }
    const topSelling = [...tally.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([name, v]) => `${name} (qty: ${v.qty}, revenue: ${v.revenue.toFixed(2)})`);

    return `
LIVE PHARMACY DATA (read-only snapshot):

== Inventory summary ==
Total tracked medicines: ${medicines.length}
Low-stock items (${lowStock.length}): ${
      lowStock.slice(0, 20).map((m: any) => `${m.name} [${m.stock_quantity}/${m.stock_alert}]`).join(", ") || "none"
    }

Top 20 medicines by lowest stock:
${medicines
  .slice(0, 20)
  .map(
    (m: any) =>
      `- ${m.name} (${m.company_name ?? "—"}): stock ${m.stock_quantity ?? 0}, price ${m.price ?? 0}, expires ${m.expiry_date ?? "—"}`
  )
  .join("\n")}

== Sales (last 30 days) ==
Total sales count: ${sales.length}
Total revenue: ${totalRevenue30d.toFixed(2)}
Today: ${todaySales.length} sales, revenue ${todayRevenue.toFixed(2)}

Top 10 selling items (30d):
${topSelling.map((s) => `- ${s}`).join("\n") || "no sales"}
`.trim();
  } catch (e) {
    console.error("Context build failed:", e);
    return "LIVE PHARMACY DATA: unavailable for this request.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = (await req.json()) as { messages: ChatMsg[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RLS-bound client (uses caller's JWT)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate token in-code (platform verify_jwt is off due to ES256)
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = await buildPharmacyContext(supabase);
    const systemPrompt = `${SYSTEM_BASE}\n\n${context}`;

    // Gemini 1.5 Flash payload
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    ).catch((e) => {
      console.error("Gemini fetch failed:", e);
      return null;
    });
    clearTimeout(timeout);

    if (!geminiRes) {
      return new Response(
        JSON.stringify({ error: "Request to AI timed out. Please try again." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error", geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Busy", code: 429 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI service error", code: geminiRes.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ??
      "I couldn't generate a reply. Please try again.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-chat fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
