import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY environment variable is not configured on Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let base64Data = "";
    let mimeType = "image/jpeg";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File || formData.get("image") as File;
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided in form-data. Expected 'file' or 'image' field." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      mimeType = file.type || "image/jpeg";
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = "";
      const len = uint8Array.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      base64Data = btoa(binary);
    } else {
      const body = await req.json();
      if (body.imageBase64) {
        const raw = body.imageBase64;
        const match = raw.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        } else {
          base64Data = raw;
          mimeType = body.mimeType || "image/jpeg";
        }
      } else {
        return new Response(
          JSON.stringify({ error: "Missing imageBase64 or multipart file payload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Call Gemini Multimodal API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

    const promptText = `
You are an expert pharmaceutical invoice parser and OCR system for retail/wholesale pharmacies in Bangladesh.
Extract all relevant invoice details from this supplier invoice/challan image.

Return ONLY a valid JSON object matching this exact structure:
{
  "supplier_name": "Name of the pharmaceutical company, distributor, or depot (e.g. Square, Beximco, Incepta, Acme, etc.)",
  "invoice_number": "The invoice/bill/memo/challan number",
  "invoice_date": "YYYY-MM-DD",
  "expected_date": "YYYY-MM-DD",
  "invoice_discount": 0,
  "vat_amount": 0,
  "notes": "Brief summary or note from invoice",
  "items": [
    {
      "medicine_name": "Full medicine trade name, dosage, and form (e.g., Napa Extra 500mg Tablet, Seclo 20mg Capsule)",
      "batch_number": "Manufacturer batch or lot number (e.g., BTH-2401)",
      "expiry_date": "YYYY-MM (e.g., 2027-12)",
      "trade_price": 2.50,
      "ordered_qty": 100,
      "bonus_qty": 0,
      "discount_percent": 0
    }
  ]
}

CRITICAL RULES:
1. Always extract the Batch Number and Expiry Date (YYYY-MM). If not visible, estimate a reasonable realistic future expiry (e.g. 2 years ahead) and batch code so inventory receiving doesn't fail.
2. Trade price (TP) must be numeric without currency symbols.
3. Quantities must be positive integers.
4. If there are free/bonus units under a scheme (e.g., 100 + 10 free), set ordered_qty: 100, bonus_qty: 10.
5. Return ONLY the raw JSON object. Do NOT wrap in markdown code blocks (\`\`\`json). No conversational prose.
`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("[process-invoice] Gemini error:", errText);
      return new Response(
        JSON.stringify({ error: `Gemini API returned error: ${geminiResponse.statusText}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return new Response(
        JSON.stringify({ error: "Gemini did not return any candidate content" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedResult: any;
    try {
      const cleanJsonStr = candidateText
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsedResult = JSON.parse(cleanJsonStr);
    } catch (parseErr) {
      console.error("[process-invoice] Failed to parse JSON:", candidateText);
      return new Response(
        JSON.stringify({ error: "Failed to parse model response as JSON", raw: candidateText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[process-invoice] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
