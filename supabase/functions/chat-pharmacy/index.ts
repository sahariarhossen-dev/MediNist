import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getRetryDelay = (response: Response, attempt: number) => {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return 1200 * 2 ** attempt;
};

const fetchGeminiWithRetry = async (url: string, init: RequestInit, maxAttempts = 3) => {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, init);

    if (response.ok) {
      return response;
    }

    lastResponse = response;
    const shouldRetry = response.status === 429 || response.status === 503;
    if (!shouldRetry || attempt === maxAttempts - 1) {
      return response;
    }

    await sleep(getRetryDelay(response, attempt));
  }

  return lastResponse;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization" });
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("pharmacy_id")
      .eq("id", user.id)
      .single();

    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId) {
      return jsonResponse(400, { error: "No pharmacy linked to your account" });
    }

    const body = await req.json().catch(() => null);
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) {
      return jsonResponse(400, { error: "Invalid request body" });
    }

    const [inventoryRes, salesTodayRes, lowStockRes] = await Promise.all([
      supabaseAdmin
        .from("medicines")
        .select("id", { count: "exact", head: true })
        .eq("pharmacy_id", pharmacyId),
      supabaseAdmin
        .from("sales")
        .select("id, total")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", new Date().toISOString().split("T")[0]),
      supabaseAdmin
        .from("medicines")
        .select("name, stock_quantity, stock_alert, company_name, price")
        .eq("pharmacy_id", pharmacyId)
        .lt("stock_quantity", 10)
        .order("stock_quantity", { ascending: true })
        .limit(15),
    ]);

    const totalProducts = inventoryRes.count ?? 0;
    const todaySales = salesTodayRes.data ?? [];
    const todaySalesCount = todaySales.length;
    const todaySalesTotal = todaySales.reduce((sum, row) => sum + Number(row.total), 0);
    const lowStockItems = lowStockRes.data ?? [];

    const dataContext = `
## Real-Time Pharmacy Data (Naseer Medical Hall)
- Total products in inventory: ${totalProducts}
- Today's sales: ${todaySalesCount} transactions, total ৳${todaySalesTotal.toFixed(2)}
- Low stock items (qty < 10): ${lowStockItems.length} items
${
  lowStockItems.length > 0
    ? "Low stock details:\n" +
      lowStockItems
        .map(
          (item) =>
            `  - ${item.name} (${item.company_name || "N/A"}): ${item.stock_quantity} left, alert at ${item.stock_alert}, price ৳${item.price}`,
        )
        .join("\n")
    : ""
}
`;

    const systemPrompt = `You are MediNist AI, a smart pharmacy assistant for "Naseer Medical Hall". You speak both English and Bangla based on the user's language.

You have access to real-time inventory and sales data from the pharmacy's database. Use this data to answer questions accurately.

${dataContext}

Your capabilities:
1. Answer inventory questions (stock counts, low stock alerts, product searches)
2. Answer sales questions (today's sales, revenue)
3. Suggest medicines based on symptoms (always with medical disclaimer)
4. Help with general pharmacy management advice

Rules:
- When suggesting medicines for symptoms, ALWAYS add: "⚠️ Disclaimer: This is not medical advice. Please consult a qualified healthcare professional before taking any medication."
- Be concise and helpful
- Format numbers with ৳ for Bangladeshi Taka
- If you don't have enough data to answer, say so honestly
- Keep responses focused and practical for a pharmacy setting`;

    const geminiContents = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      {
        role: "model",
        parts: [{ text: "Understood. I'm MediNist AI, ready to assist with pharmacy queries for Naseer Medical Hall. How can I help you?" }],
      },
      ...messages.map((message: { role?: string; content?: string }) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof message.content === "string" ? message.content : "" }],
      })),
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    const response = await fetchGeminiWithRetry(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response) {
      return jsonResponse(500, { error: "AI service error" });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        return jsonResponse(429, {
          error: "Gemini is temporarily rate-limited. Please wait a few seconds and try again.",
          code: "RATE_LIMITED",
        });
      }

      return jsonResponse(500, { error: "AI service error" });
    }

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) continue;

            const openAiChunk = JSON.stringify({
              choices: [{ delta: { content } }],
            });
            controller.enqueue(new TextEncoder().encode(`data: ${openAiChunk}\n\n`));
          } catch {
          }
        }
      },
      flush(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
    });

    return new Response(response.body?.pipeThrough(transformStream), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-pharmacy error:", e);
    return jsonResponse(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});