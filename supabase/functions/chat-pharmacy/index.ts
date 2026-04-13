import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Get user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pharmacy_id from profile
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("pharmacy_id")
      .eq("id", user.id)
      .single();

    const pharmacyId = profile?.pharmacy_id;
    if (!pharmacyId) {
      return new Response(JSON.stringify({ error: "No pharmacy linked to your account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Gather real-time pharmacy data for context
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
    const todaySalesTotal = todaySales.reduce((s, r) => s + Number(r.total), 0);
    const lowStockItems = lowStockRes.data ?? [];

    const dataContext = `
## Real-Time Pharmacy Data (Naseer Medical Hall)
- Total products in inventory: ${totalProducts}
- Today's sales: ${todaySalesCount} transactions, total ৳${todaySalesTotal.toFixed(2)}
- Low stock items (qty < 10): ${lowStockItems.length} items
${lowStockItems.length > 0 ? "Low stock details:\n" + lowStockItems.map(i => `  - ${i.name} (${i.company_name || "N/A"}): ${i.stock_quantity} left, alert at ${i.stock_alert}, price ৳${i.price}`).join("\n") : ""}
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

    // Convert messages to Gemini format
    const geminiContents = [];
    
    // Add system instruction as the first user turn for context
    geminiContents.push({
      role: "user",
      parts: [{ text: systemPrompt }],
    });
    geminiContents.push({
      role: "model",
      parts: [{ text: "Understood. I'm MediNist AI, ready to assist with pharmacy queries for Naseer Medical Hall. How can I help you?" }],
    });

    for (const msg of messages) {
      geminiContents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    // Call Gemini API directly with streaming
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform Gemini SSE stream to OpenAI-compatible SSE format so the frontend doesn't need changes
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
            if (content) {
              // Emit in OpenAI-compatible format
              const oaiChunk = JSON.stringify({
                choices: [{ delta: { content } }],
              });
              controller.enqueue(new TextEncoder().encode(`data: ${oaiChunk}\n\n`));
            }
          } catch { /* skip unparseable */ }
        }
      },
      flush(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
    });

    const transformed = response.body!.pipeThrough(transformStream);

    return new Response(transformed, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-pharmacy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
