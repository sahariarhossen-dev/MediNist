import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type OcrBody = {
  mode: "ocr";
  category: "invoice" | "prescription" | "photo";
  payload: { imageUrl: string };
};

type AssistantBody = {
  mode: "assistant";
  payload: {
    text: string;
    actionId: "smart_clean" | "translate_en" | "extract_actions";
  };
};

type Body = OcrBody | AssistantBody;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

const SYSTEM = {
  ocr_invoice:
    "You are MediNist OCR. Extract pharmacy invoice/bill data from the supplied image. " +
    "Return ONLY raw HTML (no markdown fences, no commentary). Structure: " +
    "<p><strong>Supplier:</strong> ...</p><p><strong>Invoice #:</strong> ... · <strong>Date:</strong> ...</p>" +
    "<table style=\"width:100%;border-collapse:collapse;font-size:12px;margin:6px 0\">" +
    "<thead><tr><th style=\"text-align:left;border-bottom:1px solid #e5e7eb;padding:4px\">Item</th>" +
    "<th style=\"text-align:right;border-bottom:1px solid #e5e7eb;padding:4px\">Qty</th>" +
    "<th style=\"text-align:right;border-bottom:1px solid #e5e7eb;padding:4px\">Amount</th></tr></thead>" +
    "<tbody>...rows...</tbody></table><p><strong>Total:</strong> ৳ ...</p>. " +
    "If a value is unknown, write '—'. Never invent items.",
  ocr_list:
    "You are MediNist OCR. Extract every medicine line from the prescription/photo. " +
    "Return ONLY a valid JSON array of short strings, each formatted like " +
    '"Napa Extend 665mg — 2 strips". No prose, no markdown fences, no keys, no objects. ' +
    "If nothing readable, return [].",
  smart_clean:
    "You are MediNist Assistant. Reformat the user's messy pharmacy shop note into clean, scannable HTML. " +
    "Use only <p>, <strong>, <em>, <br>. Prefer the pattern '<p><strong>Label:</strong> value</p>'. " +
    "Preserve all facts, names, amounts. Return ONLY raw HTML, no markdown fences.",
  translate_en:
    "You are MediNist Translator. Translate the note from Bangla (or mixed Bangla/English) into clear English. " +
    "Preserve names, dosages, numbers verbatim. Return ONLY raw HTML paragraphs (<p>...</p>). No fences.",
  extract_actions:
    "You are MediNist Assistant. Extract concrete action items / TODOs from the note. " +
    'Return ONLY a JSON array of short imperative strings, e.g. ["Call Rofik Bhai", "Order 2 boxes of Napa"]. ' +
    "No prose, no fences. If none, return [].",
};

async function callGateway(
  apiKey: string,
  messages: unknown[],
): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`gateway ${res.status}: ${text.slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return stripFences(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      token,
    );
    if (claimsErr || !claims?.claims?.sub) {
      return json(401, { error: "Unauthorized" });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "Missing LOVABLE_API_KEY" });

    const body = (await req.json()) as Body;
    if (!body || typeof body !== "object") {
      return json(400, { error: "Invalid body" });
    }

    let result: string;

    if (body.mode === "ocr") {
      const { category, payload } = body;
      if (!payload?.imageUrl || typeof payload.imageUrl !== "string") {
        return json(400, { error: "imageUrl required" });
      }
      const sys =
        category === "invoice" ? SYSTEM.ocr_invoice : SYSTEM.ocr_list;
      const userInstr =
        category === "invoice"
          ? "Extract this invoice."
          : "Extract every medicine line from this image.";
      result = await callGateway(apiKey, [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: userInstr },
            { type: "image_url", image_url: { url: payload.imageUrl } },
          ],
        },
      ]);
    } else if (body.mode === "assistant") {
      const { text, actionId } = body.payload ?? {};
      if (!text || typeof text !== "string") {
        return json(400, { error: "text required" });
      }
      const sys = SYSTEM[actionId as keyof typeof SYSTEM];
      if (!sys || !["smart_clean", "translate_en", "extract_actions"].includes(actionId)) {
        return json(400, { error: "Invalid actionId" });
      }
      result = await callGateway(apiKey, [
        { role: "system", content: sys },
        { role: "user", content: text.slice(0, 8000) },
      ]);
    } else {
      return json(400, { error: "Invalid mode" });
    }

    return json(200, { result });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 429) return json(429, { error: "Rate limit exceeded" });
    if (status === 402) return json(402, { error: "AI credits exhausted" });
    console.error("medinist-ai-notepad error:", e);
    return json(500, { error: "An internal error occurred. Please try again." });
  }
});