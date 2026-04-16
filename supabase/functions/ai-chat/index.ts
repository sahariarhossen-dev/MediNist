import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_BASE = `You are MediNist's professional pharmacy assistant. Help with medicine inventory, sales, and pharmacy operations. Be concise, helpful, and use markdown formatting (lists, bold, tables) when useful. Always answer based on the LIVE pharmacy data provided in the context. If asked about something not in the context, say so politely.`;
const GEMINI_MODEL = "gemini-1.5-flash-latest";
const GEMINI_TIMEOUT_MS = 30000;

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

function fallbackContextMessage(reason: string) {
  return [
    "LIVE PHARMACY DATA: unavailable for this request.",
    `Reason: ${reason}`,
    "If the user asks for exact live numbers, explain that live data could not be loaded and provide general pharmacy guidance instead.",
  ].join("\n");
}

async function buildPharmacyContext(supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    console.log("ai-chat: fetching pharmacy context");

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

    console.log(
      "ai-chat: inventory query result",
      JSON.stringify({
        count: medicines.length,
        sample: medicines.slice(0, 3),
        error: medsRes.error?.message ?? null,
      })
    );
    console.log(
      "ai-chat: sales query result",
      JSON.stringify({
        count: sales.length,
        sample: sales.slice(0, 3),
        error: salesRes.error?.message ?? null,
      })
    );
    console.log(
      "ai-chat: sale items query result",
      JSON.stringify({
        count: items.length,
        sample: items.slice(0, 3),
        error: itemsRes.error?.message ?? null,
      })
    );

    if (medsRes.error || salesRes.error || itemsRes.error) {
      return fallbackContextMessage(
        [medsRes.error?.message, salesRes.error?.message, itemsRes.error?.message]
          .filter(Boolean)
          .join(" | ") || "database query failed"
      );
    }

    if (medicines.length === 0 && sales.length === 0 && items.length === 0) {
      console.warn("ai-chat: pharmacy context empty; using fallback context");
      return fallbackContextMessage("no medicines, sales, or sale items were returned");
    }

    const lowStock = medicines.filter(
      (m: any) => (m.stock_quantity ?? 0) <= (m.stock_alert ?? 0)
    );

    const totalRevenue30d = sales.reduce((sum: number, sale: any) => sum + Number(sale.total ?? 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter((sale: any) => (sale.created_at ?? "").startsWith(today));
    const todayRevenue = todaySales.reduce(
      (sum: number, sale: any) => sum + Number(sale.total ?? 0),
      0
    );

    const tally = new Map<string, { qty: number; revenue: number }>();
    for (const item of items as any[]) {
      const current = tally.get(item.medicine_name) ?? { qty: 0, revenue: 0 };
      current.qty += Number(item.quantity ?? 0);
      current.revenue += Number(item.total_price ?? 0);
      tally.set(item.medicine_name, current);
    }

    const topSelling = [...tally.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([name, value]) => `${name} (qty: ${value.qty}, revenue: ${value.revenue.toFixed(2)})`);

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
${topSelling.map((entry) => `- ${entry}`).join("\n") || "no sales"}
`.trim();
  } catch (error) {
    console.error("ai-chat: context build failed", safeErrorMessage(error));
    return fallbackContextMessage(safeErrorMessage(error));
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
    console.log("ai-chat: GEMINI_API_KEY configured", Boolean(GEMINI_API_KEY));
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("ai-chat: auth validation failed", userErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      "ai-chat: authenticated request",
      JSON.stringify({ userId: userData.user.id, messageCount: messages.length })
    );

    const context = await buildPharmacyContext(supabase);
    const systemPrompt = `${SYSTEM_BASE}\n\n${context}`;

    const contents = messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

    console.log(
      "ai-chat: calling Gemini",
      JSON.stringify({ model: GEMINI_MODEL, messageCount: contents.length, timeoutMs: GEMINI_TIMEOUT_MS })
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
    ).catch((error) => {
      console.error("ai-chat: Gemini fetch failed", safeErrorMessage(error));
      return null;
    });

    clearTimeout(timeout);

    if (!geminiRes) {
      return new Response(
        JSON.stringify({ error: `Gemini request timed out after ${GEMINI_TIMEOUT_MS / 1000} seconds.` }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiText = await geminiRes.text();
    console.log(
      "ai-chat: Gemini raw response",
      JSON.stringify({ status: geminiRes.status, body: geminiText.slice(0, 4000) })
    );

    let geminiData: any = null;
    try {
      geminiData = geminiText ? JSON.parse(geminiText) : null;
    } catch (error) {
      console.error("ai-chat: failed to parse Gemini response", safeErrorMessage(error));
    }

    if (!geminiRes.ok) {
      const geminiErrorMessage =
        geminiData?.error?.message || geminiText || `Gemini API request failed with status ${geminiRes.status}`;

      return new Response(
        JSON.stringify({ error: geminiErrorMessage, code: geminiRes.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join("") ??
      "I couldn't generate a reply. Please try again.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-chat fatal:", safeErrorMessage(error));
    return new Response(
      JSON.stringify({ error: safeErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});