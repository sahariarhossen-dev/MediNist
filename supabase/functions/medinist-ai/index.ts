/**
 * Supabase Edge Function: medinist-ai
 * 
 * Production-Ready Multi-Tenant Pharmacy AI Assistant for "MediNist AI" (Bangladesh)
 * 
 * Key Capabilities:
 * 1. Contextual Supabase Client Initialization:
 *    - Authenticates via incoming `Authorization: Bearer <token>`
 *    - Respects Row Level Security (RLS) under caller's context
 *    - Verifies session with `supabase.auth.getUser()`
 * 
 * 2. Tenant & Role Resolution:
 *    - Queries `public.profiles` for `pharmacy_id`, `role`, and `full_name`
 *    - Normalizes role into: `salesman`, `manager`, or `owner`
 * 
 * 3. Local Bengali & Banglish Language Precision:
 *    - Recognizes medicine names in Bengali (নাপা, সেক্লো, ইত্যাদি) and Banglish phonetic spellings
 *    - Dynamically matches the user's communication style (Bengali, Banglish, English)
 * 
 * 4. Medical Safety & Legal Guardrails:
 *    - Strictly non-diagnostic; refuses clinical prescriptions and directs users to licensed doctors/pharmacists
 * 
 * 5. Multi-Tenant Role-Based Access Control (RBAC):
 *    - Salesman: Check stock/prices, view customer dues. STRICTLY FORBIDDEN from viewing sales/profit/expenses.
 *    - Manager: Salesman permissions + price management + financial reports restricted to last 7 days only.
 *    - Owner: Full unrestricted lifetime access to financials, profit, and store administration.
 * 
 * 6. Real PostgreSQL Database Tools:
 *    - `check_stock`: Queries `public.medicines` (with fallback to `public.master_medicines`)
 *    - `get_daily_sales`: Queries `public.sales` with strict RBAC enforcement
 *    - `get_customer_dues`: Queries `public.customers` and `public.customer_dues`
 * 
 * 7. Multimodal Vision OCR:
 *    - Google Gemini Vision API (base64 prescription/photo extraction) with adaptive model fallback
 * 
 * 8. Groq Tool Calling & Conversation Loop:
 *    - Intent extraction, tool execution, and natural reply synthesis
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Standard CORS headers for cross-origin browser requests
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Configuration Constants
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
const GROQ_FALLBACK_MODEL = "qwen/qwen3.8-27b";
const REQUEST_TIMEOUT_MS = 30000; // 30-second abort safeguard

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestPayload {
  messages?: ChatMessage[];
  message?: string; // Backwards compatibility for single string input
  imageBase64?: string; // Optional base64 image for Multimodal OCR
}

interface ToolCallPayload {
  tool: string;
  parameters?: Record<string, unknown>;
}

interface GroqChatCompletionResponse {
  id?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

interface UserContext {
  userId: string;
  pharmacyId: string;
  role: "salesman" | "manager" | "owner";
  fullName?: string;
  pharmacyName?: string;
}

/**
 * Common Bengali to English phonetic medicine mapping for fast normalization.
 */
const BENGALI_TO_ENGLISH_MEDICINES: Record<string, string> = {
  "নাপা": "Napa",
  "নাপা এক্সট্রা": "Napa Extra",
  "সেক্লো": "Seclo",
  "ম্যাক্সপ্রো": "Maxpro",
  "সারজেল": "Sergel",
  "এন্টাসিড": "Antacid",
  "অ্যান্টাসিড": "Antacid",
  "এইস": "Ace",
  "এইস প্লাস": "Ace Plus",
  "মোনাস": "Monas",
  "প্যান্টনিক": "Pantonic",
  "প্যান্টোবেক্স": "Pantobex",
  "প্যারাসিটামল": "Paracetamol",
  "ফেক্সো": "Fexo",
  "অ্যালাট্রোল": "Alatrol",
  "টোফেন": "Tofen",
  "অ্যাজিথ্রোমাইসিন": "Azithromycin",
  "অ্যামোক্সিসিলিন": "Amoxicillin",
  "সিসেক": "Cisec",
  "ফ্ল্যাজিল": "Flagyl",
  "লোসেকিল": "Losectil",
  "টেলমা": "Telma",
  "রেনিটিডিন": "Ranitidine",
  "ওমেপ্রাজল": "Omeprazole",
  "এসোমিপ্রাজল": "Esomeprazole",
  "সিসপ্রো": "Cipro",
  "এমলোডিপিন": "Amlodipine",
};

/**
 * Normalizes input medicine query by replacing Bengali script with recognized English trade names if present.
 */
function normalizeMedicineQuery(query: string): string {
  const trimmed = query.trim();
  for (const [bn, en] of Object.entries(BENGALI_TO_ENGLISH_MEDICINES)) {
    if (trimmed.includes(bn)) {
      return en;
    }
  }
  return trimmed;
}

/**
 * Helper to build standard JSON HTTP responses with CORS headers.
 */
function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...additionalHeaders,
    },
  });
}

/**
 * Strips markdown code fences and parses raw JSON if the model triggered a tool.
 */
function tryParseToolCall(rawContent: string): ToolCallPayload | null {
  if (!rawContent) return null;

  let cleaned = rawContent.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/, "");
    cleaned = cleaned.trim();
  }

  // Find boundaries of JSON object if extraneous whitespace exists
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.tool === "string" &&
      parsed.tool.trim().length > 0
    ) {
      return {
        tool: parsed.tool.trim(),
        parameters:
          parsed.parameters && typeof parsed.parameters === "object"
            ? (parsed.parameters as Record<string, unknown>)
            : {},
      };
    }
  } catch {
    // Normal conversational text output
  }

  return null;
}

/**
 * Performs Medical OCR via Google Gemini Vision API.
 */
async function performGeminiOcr(
  imageBase64: string,
  geminiApiKey: string,
  signal?: AbortSignal
): Promise<string> {
  let mimeType = "image/jpeg";
  let rawBase64 = imageBase64.trim();

  const match = rawBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    rawBase64 = match[2];
  }

  const modelsToTry = [
    Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash",
    "gemini-1.5-flash",
    "gemini-2.5-flash",
  ];

  let lastError = "";

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "You are a specialized medical OCR assistant for Bangladesh pharmacies. Read this doctor prescription, invoice, or medicine packaging carefully. Extract every medicine trade/brand name, dosage format (Tablet/Syrup/Capsule), strength (e.g., 500mg, 20mg), and doctor's dosing frequency (e.g., 1+0+1, after meals). Output clearly and concisely.",
                },
                {
                  inlineData: {
                    mimeType,
                    data: rawBase64,
                  },
                },
              ],
            },
          ],
        }),
        signal,
      });

      if (response.ok) {
        const data = await response.json();
        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (extractedText) {
          return extractedText;
        }
      } else {
        const errText = await response.text().catch(() => "");
        lastError = `Model ${model} returned ${response.status}: ${errText}`;
        console.warn(`[medinist-ai] Gemini OCR error with ${model}:`, errText);
      }
    } catch (fetchErr) {
      lastError = String(fetchErr);
      console.warn(`[medinist-ai] Gemini OCR fetch failed for ${model}:`, fetchErr);
    }
  }

  throw new Error(`Gemini OCR failed: ${lastError}`);
}

/**
 * Builds the Dynamic System Prompt with Bengali/Banglish language precision,
 * Medical Safety Disclaimers, and Multi-Tenant RBAC rules.
 */
function buildDynamicSystemPrompt(context: UserContext): string {
  const { role, fullName, pharmacyName, pharmacyId } = context;

  let rbacDirectives = "";

  if (role === "salesman") {
    rbacDirectives = `
========================================
STRICT RBAC PERMISSIONS: ROLE = SALESMAN
========================================
- ALLOWED:
  • Check medicine prices, strengths, dosage formats, and current inventory stock.
  • Check customer dues, outstanding balances, and customer directory info.
- STRICTLY FORBIDDEN:
  • You MUST NOT view, calculate, discuss, or query daily total sales, revenue, profit, margins, or pharmacy operating expenses.
  • You CANNOT edit or update medicine prices or financial records.
  • NEVER call the "get_daily_sales" tool.
- If the user asks for daily sales, revenue, profit, or expenses:
  • In Bengali: "দুঃখিত, সেলসম্যান অ্যাকাউন্টে বিক্রয় বা আর্থিক রিপোর্ট দেখার অনুমতি নেই। দয়া করে ম্যানেজার বা ওনারের সাথে যোগাযোগ করুন।"
  • In Banglish: "Sorry, Salesman hishabe apnar daily sales ba financial report dekhar permission nei. Please Manager ba Owner er sathe jogajog korun."
  • In English: "I'm sorry, as a Salesman you do not have permission to view sales figures or financial reports. Please contact your Manager or Owner."`;
  } else if (role === "manager") {
    rbacDirectives = `
=======================================
STRICT RBAC PERMISSIONS: ROLE = MANAGER
=======================================
- ALLOWED:
  • Check medicine prices, stock inventory, customer dues, and edit medicine prices.
  • View financial reports and total sales, but STRICTLY RESTRICTED to the last 7 days.
- STRICTLY FORBIDDEN:
  • You CANNOT query or view financial reports beyond the last 7 days or lifetime profit analytics.
- If the user asks for sales older than 7 days, politely explain the 7-day restriction for Managers.`;
  } else {
    // Owner / Admin
    rbacDirectives = `
=====================================
STRICT RBAC PERMISSIONS: ROLE = OWNER
=====================================
- UNRESTRICTED ACCESS:
  • Full authorization across all pharmacy operations, stock, prices, customer dues, and staff administration.
  • Full access to lifetime financial analytics, daily sales totals, revenue trends, and profit margins.`;
  }

  return `You are MediNist AI, the intelligent, highly capable pharmacy co-pilot built specifically for pharmacy owners, managers, and salesmen in Bangladesh.

CONTEXT:
- Logged-in Staff: ${fullName || "Staff Member"}
- Active Role: ${role.toUpperCase()}
- Pharmacy: ${pharmacyName || "MediNist Store"} (Tenant ID: ${pharmacyId})

${rbacDirectives}

LANGUAGE & LOCAL FLUENCY (BENGALI / BANGLISH PRECISION):
- You possess native fluency in Bengali (বাংলা), Banglish (Bengali written in English letters, e.g., "Napa koyta ache?", "Baki koto taka?", "Ajker total bikri koto?"), and standard English.
- Always mirror the user's language style:
  • If user types in Bengali script, reply in polite, natural Bengali.
  • If user types in Banglish, reply in natural, friendly Banglish.
  • If user types in English, reply in concise, professional English.
- You understand local medicine phonetic variations (e.g., "Napa", "নাপা", "Seclo", "সেক্লো", "Maxpro", "ম্যাক্সপ্রো", "Sergel", "সারজেল", "Ace", "এইস", "Antacid", "এন্টাসিড", "Monas", "মোনাস", "Fexo", "ফেক্সো"). Always map them to the proper trade name when searching.
- Currency: Always format monetary amounts with the Bangladeshi Taka sign (৳) or "Taka" (e.g., ৳120.00).

MEDICAL SAFETY & LEGAL GUARDRAILS (CRITICAL):
- You are a pharmacy management and inventory assistant, NOT a medical doctor.
- You must EXPLICITLY NOT diagnose diseases or prescribe treatment courses.
- If a customer or user asks what medicine to take for an illness (e.g., "আমার পেট ব্যথা করছে কি খাব?"), you MUST provide a disclaimer stating that clinical treatment requires consultation with a registered doctor (BMDC registered) or licensed pharmacist before taking prescription medication.

AVAILABLE DATABASE TOOLS:
1. check_stock(medicine_name):
   - Queries the pharmacy's real inventory for stock quantity, price, generic, and manufacturer.
   - If local stock is 0, checks the master catalog to inform if it exists in Bangladesh.
2. get_daily_sales(date?):
   - Queries sales transactions for today (or a specific date within the allowed window).
   - Only accessible to Manager (up to 7 days) and Owner (lifetime). Salesman is strictly blocked.
3. get_customer_dues(customer_name?):
   - Queries customer directory and dues ledger for outstanding balances (বাকি/ডিউ).
   - If no specific customer name is supplied, lists customers with the highest pending balances.

TOOL CALL PROTOCOL:
If you need to query database information via a tool to answer the user, you MUST respond ONLY with a raw JSON object formatted exactly as:
{"tool": "tool_name", "parameters": {"key": "value"}}

CRITICAL: Do NOT wrap the JSON in markdown code blocks (\`\`\`json). Output ONLY the raw JSON string.
If no tool is required, or if the user's role prohibits the operation, reply directly with natural, courteous text.`;
}

/**
 * Real Database Tool Execution connected to Supabase PostgreSQL with Tenant Isolation.
 */
async function executeDatabaseTool(
  toolName: string,
  parameters: Record<string, unknown> | undefined,
  supabase: SupabaseClient,
  context: UserContext
): Promise<string> {
  const normalizedTool = toolName.trim().toLowerCase();
  const { pharmacyId, role } = context;

  // 1. check_stock Tool
  if (normalizedTool === "check_stock") {
    const rawSearch =
      (parameters?.medicine_name as string) ||
      (parameters?.medicine as string) ||
      (parameters?.name as string) ||
      "";
    
    const searchString = normalizeMedicineQuery(rawSearch);

    if (!searchString) {
      return "Result: Error: Please provide the medicine name to look up.";
    }

    try {
      // Query tenant-isolated medicines table
      const { data: medicines, error } = await supabase
        .from("medicines")
        .select(
          "id, name, generic_name, company_name, strength, format, price, stock_quantity, stock_alert, expiry_date, unit_format"
        )
        .eq("pharmacy_id", pharmacyId)
        .ilike("name", `%${searchString}%`)
        .order("name", { ascending: true })
        .limit(6);

      if (error) {
        console.error("[medinist-ai] DB error querying medicines:", error);
        return `Result: Database error while searching for "${searchString}": ${error.message}`;
      }

      if (!medicines || medicines.length === 0) {
        // Fallback: Check national master catalog to provide full catalog context
        const { data: masterData } = await supabase
          .from("master_medicines")
          .select("brand_name, generic_name, company, strength, format, unit_price")
          .ilike("brand_name", `%${searchString}%`)
          .limit(3);

        if (masterData && masterData.length > 0) {
          const suggestions = masterData
            .map(
              (m) =>
                `• ${m.brand_name} (${m.strength || ""}) [${m.format || "Unit"}] - ${
                  m.company || "Unknown Company"
                } | Master MRP: ৳${m.unit_price ?? "N/A"}`
            )
            .join("\n");

          return `Result: "${searchString}" is OUT OF STOCK (0 units) in this pharmacy. However, it is listed in the National Master Catalog:\n${suggestions}`;
        }

        return `Result: No medicine matching "${searchString}" was found in your pharmacy stock or national catalog.`;
      }

      const formattedMatches = medicines
        .map((med) => {
          const qty = med.stock_quantity ?? 0;
          const unit = med.unit_format || "units";
          const price = med.price !== null ? `৳${med.price}` : "Price not set";
          const alert = med.stock_alert && qty <= med.stock_alert ? " (LOW STOCK / স্টক কম)" : "";
          const expiry = med.expiry_date ? ` | Exp: ${med.expiry_date}` : "";
          const generic = med.generic_name ? ` [Generic: ${med.generic_name}]` : "";
          return `• ${med.name} (${med.strength || med.format || ""})${generic} - ${
            med.company_name || "N/A"
          } | Stock: ${qty} ${unit}${alert} | Price: ${price}${expiry}`;
        })
        .join("\n");

      return `Result: Found ${medicines.length} match(es) in your pharmacy inventory:\n${formattedMatches}`;
    } catch (err) {
      console.error("[medinist-ai] Exception in check_stock:", err);
      return `Result: Failed to query inventory: ${String(err)}`;
    }
  }

  // 2. get_daily_sales Tool
  if (normalizedTool === "get_daily_sales") {
    // STRICT RBAC CHECK: Salesman is forbidden from viewing sales
    if (role === "salesman") {
      console.warn(`[medinist-ai] Blocked Salesman (${context.userId}) from accessing get_daily_sales.`);
      return "Result: UNAUTHORIZED: Salesman role is strictly forbidden from accessing daily sales, revenue, or financial reports.";
    }

    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

      const requestedDate = parameters?.date as string | undefined;
      let filterStart = startOfDay;
      let filterEnd = endOfDay;

      if (requestedDate && typeof requestedDate === "string") {
        const parsedDate = new Date(requestedDate);
        if (!isNaN(parsedDate.getTime())) {
          if (role === "manager") {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            if (parsedDate < sevenDaysAgo) {
              return "Result: UNAUTHORIZED: Manager access is restricted to sales records within the last 7 days only.";
            }
          }
          filterStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0).toISOString();
          filterEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999).toISOString();
        }
      }

      // Query real sales table for this tenant
      const { data: sales, error } = await supabase
        .from("sales")
        .select("id, total, subtotal, discount_amount, sale_type, status, created_at")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", filterStart)
        .lte("created_at", filterEnd);

      if (error) {
        console.error("[medinist-ai] Error querying sales table:", error);
        return `Result: Database error while calculating sales: ${error.message}`;
      }

      const activeSales = (sales || []).filter(
        (s) => (s.status || "").toLowerCase() !== "cancelled" && (s.status || "").toLowerCase() !== "void"
      );

      const invoiceCount = activeSales.length;
      const totalRevenue = activeSales.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
      const totalDiscount = activeSales.reduce((acc, curr) => acc + (Number(curr.discount_amount) || 0), 0);

      const targetLabel = requestedDate ? requestedDate : "Today";

      return `Result: ${targetLabel}'s Sales Summary: Total Revenue: ৳${totalRevenue.toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} across ${invoiceCount} invoice(s). Total discounts: ৳${totalDiscount.toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`;
    } catch (err) {
      console.error("[medinist-ai] Exception in get_daily_sales:", err);
      return `Result: Failed to calculate daily sales: ${String(err)}`;
    }
  }

  // 3. get_customer_dues Tool
  if (normalizedTool === "get_customer_dues") {
    const rawCustomerQuery =
      (parameters?.customer_name as string) ||
      (parameters?.name as string) ||
      (parameters?.phone as string) ||
      "";
    const customerQuery = rawCustomerQuery.trim();

    try {
      if (customerQuery) {
        // Query specific customer by name or phone
        const { data: customers, error } = await supabase
          .from("customers")
          .select("id, name, phone, address, total_due, notes, updated_at")
          .eq("pharmacy_id", pharmacyId)
          .or(`name.ilike.%${customerQuery}%,phone.ilike.%${customerQuery}%`)
          .limit(5);

        if (error) {
          console.error("[medinist-ai] DB error querying customers:", error);
          return `Result: Database error while searching for customer "${customerQuery}": ${error.message}`;
        }

        if (!customers || customers.length === 0) {
          // Fallback check in customer_dues table
          const { data: duesRecords } = await supabase
            .from("customer_dues")
            .select("customer_name, amount_due, amount_paid, created_at")
            .eq("pharmacy_id", pharmacyId)
            .ilike("customer_name", `%${customerQuery}%`)
            .limit(3);

          if (duesRecords && duesRecords.length > 0) {
            const list = duesRecords
              .map(
                (d) =>
                  `• ${d.customer_name || "Customer"}: Due: ৳${d.amount_due} (Paid: ৳${d.amount_paid})`
              )
              .join("\n");
            return `Result: Customer ledger records for "${customerQuery}":\n${list}`;
          }

          return `Result: No customer record or dues found matching "${customerQuery}".`;
        }

        const details = customers
          .map((c) => {
            const due = Number(c.total_due) || 0;
            const phoneStr = c.phone ? ` | Phone: ${c.phone}` : "";
            const addrStr = c.address ? ` | Address: ${c.address}` : "";
            return `• ${c.name}${phoneStr}${addrStr} -> Total Outstanding Due (বাকি): ৳${due.toLocaleString(
              "en-BD",
              { minimumFractionDigits: 2 }
            )}`;
          })
          .join("\n");

        return `Result: Customer dues details:\n${details}`;
      } else {
        // Return top customers with pending dues
        const { data: topDues, error } = await supabase
          .from("customers")
          .select("name, phone, total_due")
          .eq("pharmacy_id", pharmacyId)
          .gt("total_due", 0)
          .order("total_due", { ascending: false })
          .limit(5);

        if (error) {
          console.error("[medinist-ai] DB error fetching top dues:", error);
          return `Result: Database error while fetching customer dues list: ${error.message}`;
        }

        if (!topDues || topDues.length === 0) {
          return "Result: No customers currently have outstanding dues in this pharmacy.";
        }

        const formatted = topDues
          .map(
            (c, i) =>
              `${i + 1}. ${c.name} (${c.phone || "No phone"}): ৳${(Number(c.total_due) || 0).toLocaleString(
                "en-BD",
                { minimumFractionDigits: 2 }
              )}`
          )
          .join("\n");

        return `Result: Top outstanding customer dues in pharmacy:\n${formatted}`;
      }
    } catch (err) {
      console.error("[medinist-ai] Exception in get_customer_dues:", err);
      return `Result: Failed to query customer dues: ${String(err)}`;
    }
  }

  return `Result: Tool "${toolName}" is not supported.`;
}

// Deno HTTP Server entrypoint
Deno.serve(async (req: Request): Promise<Response> => {
  // 1. Handle CORS Preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // 2. Reject unsupported HTTP methods
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: `Method ${req.method} not allowed. Please use POST.`,
    });
  }

  // AbortController safeguard covering entire pipeline within 30s
  const globalAbortController = new AbortController();
  const timeoutId = setTimeout(() => globalAbortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    // 3. Contextual Supabase Client Initialization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[medinist-ai] Missing or invalid Authorization header.");
      return jsonResponse(401, {
        error: "Unauthorized: Missing or invalid Authorization header.",
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[medinist-ai] Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.");
      return jsonResponse(500, {
        error: "Server configuration error: Supabase environment variables are missing.",
      });
    }

    // Initialize Supabase client under caller's authorization context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 4. Resolve Authenticated User and Tenant (profiles table)
    const {
      data: { user },
      error: userAuthError,
    } = await supabase.auth.getUser();

    if (userAuthError || !user) {
      console.warn("[medinist-ai] Auth verification failed:", userAuthError?.message);
      return jsonResponse(401, {
        error: "Unauthorized: Invalid or expired user session.",
        details: userAuthError?.message,
      });
    }

    // Query profiles table to resolve tenant pharmacy_id and user role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, pharmacy_id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[medinist-ai] Failed to fetch user profile:", profileError);
      return jsonResponse(500, {
        error: "Database error: Could not verify user profile.",
        details: profileError.message,
      });
    }

    if (!profile?.pharmacy_id) {
      console.warn(`[medinist-ai] User ${user.id} has no pharmacy_id assigned.`);
      return jsonResponse(403, {
        error: "Forbidden: You are not assigned to an active pharmacy tenant.",
      });
    }

    // Normalize user role according to MediNist RBAC matrix (salesman, manager, owner)
    const rawRole = (profile.role || "salesman").toLowerCase().trim();
    let userRole: "salesman" | "manager" | "owner" = "salesman";
    if (rawRole === "owner" || rawRole === "admin" || rawRole === "proprietor") {
      userRole = "owner";
    } else if (rawRole === "manager") {
      userRole = "manager";
    } else {
      userRole = "salesman";
    }

    // Fetch pharmacy name for personalized response context
    let pharmacyName = "MediNist Pharmacy";
    const { data: pharmacyData } = await supabase
      .from("pharmacies")
      .select("name")
      .eq("id", profile.pharmacy_id)
      .maybeSingle();
    if (pharmacyData?.name) {
      pharmacyName = pharmacyData.name;
    }

    const userContext: UserContext = {
      userId: user.id,
      pharmacyId: profile.pharmacy_id,
      role: userRole,
      fullName: profile.full_name || undefined,
      pharmacyName,
    };

    console.log(
      `[medinist-ai] Request authenticated: User=${userContext.fullName || userContext.userId}, Role=${userContext.role}, Pharmacy=${userContext.pharmacyName}`
    );

    // 5. Environment Validation for Groq AI API
    const groqApiKey = Deno.env.get("GROQ_API_KEY")?.trim();
    if (!groqApiKey) {
      console.error("[medinist-ai] Missing GROQ_API_KEY environment variable.");
      return jsonResponse(500, {
        error: "Server configuration error: GROQ_API_KEY is not configured.",
      });
    }

    // 6. Request Payload Parsing & Validation
    let payload: RequestPayload;
    try {
      const rawBody = await req.json();
      if (!rawBody || typeof rawBody !== "object") {
        throw new Error("Payload is not a valid JSON object.");
      }
      payload = rawBody as RequestPayload;
    } catch (parseError) {
      console.warn("[medinist-ai] Malformed JSON payload received:", parseError);
      return jsonResponse(400, {
        error: "Invalid JSON body. Please provide a JSON object with a 'messages' array.",
      });
    }

    // Extract conversation messages from payload
    let incomingMessages: ChatMessage[] = [];

    if (payload.messages !== undefined) {
      if (!Array.isArray(payload.messages)) {
        return jsonResponse(400, {
          error: "Invalid payload: 'messages' field must be an array of { role, content } objects.",
        });
      }

      incomingMessages = payload.messages
        .filter(
          (m): m is ChatMessage =>
            typeof m === "object" &&
            m !== null &&
            (m.role === "user" || m.role === "assistant" || m.role === "system") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
        .map((m) => ({
          role: m.role,
          content: m.content.trim(),
        }));
    } else if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      incomingMessages = [{ role: "user", content: payload.message.trim() }];
    } else {
      return jsonResponse(400, {
        error: "Invalid or missing 'messages' array. Please provide an array of conversation messages.",
      });
    }

    if (incomingMessages.length === 0) {
      return jsonResponse(400, {
        error: "The 'messages' array cannot be empty. Please provide at least one valid message.",
      });
    }

    // 7. Multimodal Vision / OCR via Google Gemini API
    if (
      payload.imageBase64 &&
      typeof payload.imageBase64 === "string" &&
      payload.imageBase64.trim().length > 0
    ) {
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
      let ocrNote = "";

      if (geminiApiKey) {
        try {
          console.log("[medinist-ai] Processing prescription image with Gemini Vision OCR...");
          const extractedOcrText = await performGeminiOcr(
            payload.imageBase64,
            geminiApiKey,
            globalAbortController.signal
          );
          console.log(
            "[medinist-ai] Gemini OCR extraction succeeded:",
            extractedOcrText.slice(0, 120)
          );
          ocrNote = `\n[System Note: User uploaded a prescription image. OCR Extracted Text: ${extractedOcrText}]`;
        } catch (ocrError) {
          console.warn("[medinist-ai] Gemini OCR processing failed:", ocrError);
          ocrNote = "\n[System Note: Image upload could not be processed by OCR.]";
        }
      } else {
        console.warn("[medinist-ai] GEMINI_API_KEY missing, skipping OCR processing.");
        ocrNote = "\n[System Note: Vision OCR key not configured on server.]";
      }

      // Append invisibly to the latest user message in incomingMessages
      const lastUserIndex = incomingMessages.map((m) => m.role).lastIndexOf("user");
      if (lastUserIndex !== -1) {
        incomingMessages[lastUserIndex].content += ocrNote;
      } else {
        incomingMessages.push({
          role: "user",
          content: ocrNote.trim(),
        });
      }
    }

    // 8. Generate Dynamic RBAC System Prompt based on user context
    const dynamicSystemPrompt = buildDynamicSystemPrompt(userContext);

    // Build conversation array with Dynamic System Prompt prepended
    const conversation: ChatMessage[] = [
      {
        role: "system",
        content: dynamicSystemPrompt,
      },
      ...incomingMessages,
    ];

    // Helper: Execute a chat completion call with adaptive fallback model support
    const maxTokens = Number(Deno.env.get("GROQ_MAX_TOKENS")) || 650;

    const callGroq = async (messages: ChatMessage[]): Promise<string> => {
      const performCall = async (model: string, tokens: number) => {
        return await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.6,
            max_tokens: tokens,
          }),
          signal: globalAbortController.signal,
        });
      };

      let groqRes = await performCall(GROQ_MODEL, maxTokens);

      if (
        (groqRes.status === 404 || groqRes.status === 429) &&
        GROQ_MODEL !== GROQ_FALLBACK_MODEL
      ) {
        console.warn(
          `[medinist-ai] Model ${GROQ_MODEL} returned ${groqRes.status}. Retrying with fallback model ${GROQ_FALLBACK_MODEL}...`
        );
        groqRes = await performCall(GROQ_FALLBACK_MODEL, 350);
      }

      if (!groqRes.ok) {
        const errorText = await groqRes.text().catch(() => "");
        console.error(`[medinist-ai] Groq API error (${groqRes.status}):`, errorText);
        throw new Error(`Groq API error status ${groqRes.status}: ${errorText.slice(0, 200)}`);
      }

      const data: GroqChatCompletionResponse = await groqRes.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("Received empty reply from AI model.");
      }
      return content;
    };

    // Step A: First call to Groq API
    console.log("[medinist-ai] Executing Step A: Initial Groq API call...");
    const initialReply = await callGroq(conversation);

    // Step B: Intent Parsing - check if model outputted a tool call
    const toolCall = tryParseToolCall(initialReply);

    if (toolCall) {
      // Step C: Tool call detected
      console.log(`[medinist-ai] Step C: Tool call detected -> ${toolCall.tool}`, toolCall.parameters);
      
      // Execute REAL PostgreSQL tool query with tenant context
      const toolResult = await executeDatabaseTool(
        toolCall.tool,
        toolCall.parameters,
        supabase,
        userContext
      );
      console.log(`[medinist-ai] Database tool result: ${toolResult}`);

      // Append assistant's tool call & system tool result to conversation history
      conversation.push({
        role: "assistant",
        content: initialReply,
      });
      conversation.push({
        role: "system",
        content: toolResult,
      });

      // Step D: Second call to Groq API to formulate natural response using database data
      console.log("[medinist-ai] Executing second Groq call with DB tool result...");
      const finalHumanReply = await callGroq(conversation);

      return jsonResponse(200, {
        reply: finalHumanReply,
      });
    }

    // Normal Conversational Text - return directly
    return jsonResponse(200, {
      reply: initialReply,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[medinist-ai] Request timed out after 30 seconds.");
      return jsonResponse(504, {
        error: "Gateway Timeout: Operation took too long to respond. Please try again.",
      });
    }

    console.error("[medinist-ai] Unhandled execution error:", err);
    return jsonResponse(500, {
      error: "An internal server error occurred while processing your request.",
      details: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeoutId);
  }
});
