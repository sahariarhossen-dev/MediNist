import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple per-user debounce map (user_id -> last request timestamp)
const lastRequestMap = new Map<string, number>();
const DEBOUNCE_MS = 5000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured" }),
        { status: 500, headers }
      );
    }

    // Extract user from auth header for debounce key
    const authHeader = req.headers.get("authorization") ?? "anon";
    const debounceKey = authHeader.slice(-16); // last 16 chars as key

    const now = Date.now();
    const lastReq = lastRequestMap.get(debounceKey) ?? 0;
    if (now - lastReq < DEBOUNCE_MS) {
      const waitSec = Math.ceil((DEBOUNCE_MS - (now - lastReq)) / 1000);
      return new Response(
        JSON.stringify({ error: `Please wait ${waitSec} more second(s) before sending another message.` }),
        { status: 429, headers }
      );
    }
    lastRequestMap.set(debounceKey, now);

    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'message' field" }),
        { status: 400, headers }
      );
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    let response: Response;
    try {
      response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are a professional pharmacy assistant for MediNist. You help with medicine inventory and sales information. Be helpful and concise." }],
          },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      });
    } catch (fetchErr) {
      console.error("Gemini fetch exception:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Request to AI service timed out or failed. Please try again." }),
        { status: 500, headers }
      );
    }

    const responseBody = await response.text();

    if (!response.ok) {
      console.error("Gemini API error:", {
        status: response.status,
        body: responseBody,
      });

      const userMsg = response.status === 429
        ? "System is busy, please wait a moment and try again."
        : "Failed to get a response from the AI service.";

      return new Response(
        JSON.stringify({ error: userMsg }),
        { status: response.status === 429 ? 429 : 500, headers }
      );
    }

    let data: any;
    try {
      data = JSON.parse(responseBody);
    } catch {
      console.error("Failed to parse Gemini response:", responseBody);
      return new Response(
        JSON.stringify({ error: "Invalid response from AI service." }),
        { status: 500, headers }
      );
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I couldn't generate a response.";

    return new Response(JSON.stringify({ reply }), { status: 200, headers });
  } catch (e) {
    console.error("gemini-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers }
    );
  }
});
