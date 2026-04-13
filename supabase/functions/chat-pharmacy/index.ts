import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CHAT_HISTORY_MESSAGES = 6;
const MAX_LOW_STOCK_ITEMS = 5;
const GEMINI_MODEL = "gemini-1.5-flash";
const RATE_LIMIT_MESSAGE = "⚠️ Gemini is temporarily rate-limited. Please wait a bit and try again.";
const SERVICE_UNAVAILABLE_MESSAGE = "⚠️ I couldn't reach the AI service right now. Please try again shortly.";

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const streamAssistantMessage = (message: string) => {
  const chunk = JSON.stringify({
    choices: [{ delta: { content: message } }],
  });

  return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
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
    const isConnectionTest = body?.testConnection === true;
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : null;
    if (!isConnectionTest && !incomingMessages) {
      return jsonResponse(400, { error: "Invalid request body" });
    }

    const messages = (incomingMessages ?? [])
      .filter((message: { role?: string; content?: string }) => typeof message?.content === "string")
      .filter((message: { role?: string; content?: string }) => message.content!.trim().length > 0)
      .filter((message: { role?: string; content?: string }) => message.role !== "assistant")
      .slice(-MAX_CHAT_HISTORY_MESSAGES);

    let dataContext = "";

    if (!isConnectionTest) {
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
          .limit(MAX_LOW_STOCK_ITEMS),
      ]);

      const totalProducts = inventoryRes.count ?? 0;
      const todaySales = salesTodayRes.data ?? [];
      const todaySalesCount = todaySales.length;
      const todaySalesTotal = todaySales.reduce((sum, row) => sum + Number(row.total), 0);
      const lowStockItems = lowStockRes.data ?? [];

      dataContext = `
## Live Pharmacy Summary
- Total products: ${totalProducts}
- Today's sales: ${todaySalesCount} transactions, total ৳${todaySalesTotal.toFixed(2)}
- Low stock items (qty < 10): ${lowStockItems.length}
${
  lowStockItems.length > 0
    ? "- Lowest stock examples:\n" +
      lowStockItems
        .map(
          (item) =>
            `  - ${item.name}: ${item.stock_quantity} left${item.company_name ? ` (${item.company_name})` : ""}`,
        )
        .join("\n")
    : ""
}
`;
    }
    const geminiContents = isConnectionTest
      ? [
          {
            role: "user",
            parts: [{ text: "Reply with exactly: Connection OK" }],
          },
        ]
      : [
          {
            role: "user",
            parts: [
              {
                text: `You are MediNist AI for \"Naseer Medical Hall\". Match the user's language (English or Bangla) and keep replies concise and practical.

${dataContext}

Rules:
- Use ৳ for Bangladeshi Taka.
- When suggesting medicines for symptoms, ALWAYS add: \"⚠️ Disclaimer: This is not medical advice. Please consult a qualified healthcare professional before taking any medication.\"
- If data is insufficient, say so clearly.`,
              },
            ],
          },
          {
            role: "model",
            parts: [{ text: "Understood." }],
          },
          ...messages.map((message: { role?: string; content?: string }) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: typeof message.content === "string" ? message.content : "" }],
          })),
        ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: {
          temperature: isConnectionTest ? 0 : 0.4,
          topP: isConnectionTest ? 0.1 : 0.8,
          topK: isConnectionTest ? 1 : 20,
          maxOutputTokens: isConnectionTest ? 24 : 768,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        return streamAssistantMessage(RATE_LIMIT_MESSAGE);
      }

      return streamAssistantMessage(SERVICE_UNAVAILABLE_MESSAGE);
    }

    if (!response.body) {
      return streamAssistantMessage("⚠️ I received an empty AI response. Please try again.");
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

    return new Response(response.body.pipeThrough(transformStream), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-pharmacy error:", e);
    return streamAssistantMessage("⚠️ I ran into a temporary problem. Please try again.");
  }
});