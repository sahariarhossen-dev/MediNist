/**
 * Supabase Edge Function: medinist-ai
 * 
 * Production-Grade Multi-Tenant Pharmacy AI Copilot for "MediNist AI" (Bangladesh)
 * Strictly using verified single models: Groq (qwen/qwen3.8-27b) and Gemini (gemini-2.5-flash).
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Standard CORS headers for cross-origin browser requests
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Verified Model Constants
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "qwen/qwen3.8-27b";
const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_WHISPER_MODEL = "whisper-large-v3";
const GEMINI_MODEL = "gemini-2.5-flash";

const REQUEST_TIMEOUT_MS = 30000; // 30-second abort safeguard

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestPayload {
  messages?: ChatMessage[];
  message?: string; // Backwards compatibility for single string input
  imageBase64?: string; // Optional base64 image for Multimodal OCR
  audioBase64?: string; // Optional base64 audio for Groq Whisper transcription
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

interface BangladeshTimeInfo {
  time12: string;        // e.g. "9:24 PM"
  time24: string;        // e.g. "21:24"
  dateFormatted: string; // e.g. "Monday, September 14, 2026"
  banglaDate: string;    // e.g. "১৪ সেপ্টেম্বর, ২০২৬"
  dayOfWeek: string;     // e.g. "Monday"
  rawDate: string;       // YYYY-MM-DD
}

/**
 * Resolves current live Bangladesh local time in Asia/Dhaka timezone.
 */
function getBangladeshTimeContext(): BangladeshTimeInfo {
  const now = new Date();

  const time12 = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(now);

  const time24 = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const dateFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);

  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
  }).format(now);

  const rawDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return {
    time12,
    time24,
    dateFormatted,
    banglaDate: dateFormatted,
    dayOfWeek,
    rawDate,
  };
}

/**
 * Common Bengali script to English phonetic medicine mapping.
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
 * Normalizes input medicine query by replacing Bengali script with recognized trade names.
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
 * Exhaustive Response Sanitizer:
 * Scrubs internal agent tags ([[agent:...]]), raw UI cards JSON ({"cards":...}),
 * unparsed tool JSON calls, and code block leakage.
 */
function sanitizeResponse(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let cleaned = raw;

  // 1. Scrub internal card/agent tags: [[agent:...]] and anything that trails inside
  cleaned = cleaned.replace(/\[\[agent:[^\]]+\]\][\s\S]*$/gi, "");
  cleaned = cleaned.replace(/\[\[agent:[^\]]+\]\]/gi, "");

  // 2. Scrub raw card/suggestion payloads: {"cards": [...]} or {"suggestions": [...]}
  cleaned = cleaned.replace(/\{"cards":\s*\[[\s\S]*?\}\s*$/gi, "");
  cleaned = cleaned.replace(/\{"suggestions":\s*\[[\s\S]*?\}\s*$/gi, "");

  // 3. Scrub unparsed tool JSON calls: ```json {"tool": ...} ``` or raw {"tool": "...", "parameters": ...}
  cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"tool"[\s\S]*?\}\s*```/gi, "");
  cleaned = cleaned.replace(/\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}/gi, "");

  // 4. Scrub trailing unclosed code blocks or stray JSON fragments
  cleaned = cleaned.replace(/```json\s*[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/```\s*$/g, "");

  return cleaned.trim();
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

  // Find boundaries of JSON object if extraneous text surrounds it
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
    // Normal conversational text
  }

  return null;
}

/**
 * Performs Multimodal Medical Prescription & Invoice OCR strictly via Google Gemini Flash API.
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

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
              text: "You are a specialized medical OCR assistant for Bangladesh pharmacies. Read this doctor prescription, invoice, or medicine packaging carefully. Extract every medicine trade/brand name, dosage format (Tablet/Syrup/Capsule/Drop), strength (e.g., 500mg, 20mg, 10ml), and doctor's dosing frequency (e.g., 1+0+1, after meals). Output clearly and concisely.",
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

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Gemini OCR failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!extractedText) {
    throw new Error("Gemini OCR returned empty text content.");
  }
  return extractedText;
}

/**
 * Converts a base64 encoded audio string into a standard File object for Groq Whisper multipart upload.
 * Supports various audio formats (e.g. webm, wav, mp3, mp4, m4a, ogg).
 */
function base64ToAudioFile(audioBase64: string, filename = "audio.webm"): File {
  let mimeType = "audio/webm";
  let cleanBase64 = audioBase64.trim();

  // Strip data URI prefix if present (e.g. data:audio/webm;base64,...)
  const dataUrlMatch = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    cleanBase64 = dataUrlMatch[2];
  }

  // Decode binary data
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Derive file extension from MIME type
  let ext = "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) ext = "m4a";
  else if (mimeType.includes("wav")) ext = "wav";
  else if (mimeType.includes("mp3") || mimeType.includes("mpeg")) ext = "mp3";
  else if (mimeType.includes("ogg")) ext = "ogg";

  const resolvedFilename = filename.includes(".") ? filename : `${filename}.${ext}`;
  const blob = new Blob([bytes], { type: mimeType });
  return new File([blob], resolvedFilename, { type: mimeType });
}

/**
 * Performs Audio Transcription using Groq's whisper-large-v3 model.
 * Sends a multipart/form-data POST request to https://api.groq.com/openai/v1/audio/transcriptions.
 */
async function performGroqWhisperTranscription(
  audioBase64: string,
  groqApiKey: string,
  signal?: AbortSignal
): Promise<string> {
  const audioFile = base64ToAudioFile(audioBase64);
  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", GROQ_WHISPER_MODEL);
  formData.append("response_format", "json");

  console.log(
    `[medinist-ai] Calling Groq Whisper (${GROQ_WHISPER_MODEL}) with ${audioFile.size} bytes audio (${audioFile.type})...`
  );

  const response = await fetch(GROQ_WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Groq Whisper transcription failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const transcribedText = typeof data.text === "string" ? data.text.trim() : "";
  if (!transcribedText) {
    throw new Error("Groq Whisper transcription returned empty text.");
  }
  return transcribedText;
}

/**
 * Fallback Audio Transcription using Google Gemini 2.5 Flash multimodal audio capability
 * when Groq Whisper is unavailable or encounters an upstream issue.
 */
async function performGeminiAudioTranscription(
  audioBase64: string,
  geminiApiKey: string,
  signal?: AbortSignal
): Promise<string> {
  let mimeType = "audio/webm";
  let cleanBase64 = audioBase64.trim();

  const dataUrlMatch = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    cleanBase64 = dataUrlMatch[2];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
  console.log(`[medinist-ai] Calling Gemini Flash (${GEMINI_MODEL}) audio transcription fallback...`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: "Please transcribe this spoken voice audio verbatim in English or Bengali. Output ONLY the raw transcribed text without any extra notes, timestamps, quotes, or markdown formatting.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`Gemini audio transcription failed (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini audio transcription returned empty text.");
  }
  return text.trim();
}

/**
 * Fast Regex & Keyword Heuristic Intent Classifier.
 * Provides zero-latency local routing for common queries without network/API overhead.
 */
function heuristicClassifier(query: string): "CASUAL" | "PHARMACY_ACTION" | "AMBIGUOUS" {
  const q = query.toLowerCase().trim();

  // 1. Strong Casual Indicators (greetings, time queries, feelings, polite banter)
  const casualPatterns = [
    /^(hi|hello|hey|salaam|assalamu\s*alaikum|kemon\s*ac[ho]|ki\s*obostha|ki\s*khobor|val[ao]\s*ac[ho])/i,
    /(koi\s*ta\s*baje|somoy\s*koto|time\s*koto|what\s*time|ajke\s*ki\s*bar|ajker\s*tarikh|ajk\s*ki\s*bar)/i,
    /^(dhonnobad|thanks|thank\s*you|shuvo\s*sokal|shuvo\s*ratri|bye|goodbye|good\s*morning|good\s*night)/i,
    /^(who\s*are\s*you|tumi\s*ke|apni\s*ke|ki\s*koro|apnar\s*nam\s*ki|tomar\s*nam\s*ki)/i,
    /^(ok|okay|acha|accha|thik\s*ache|hmmm?|bolen|ji|haan)$/i,
  ];

  for (const pattern of casualPatterns) {
    if (pattern.test(q)) {
      return "CASUAL";
    }
  }

  // 2. Strong Pharmacy Action Indicators
  const pharmacyPatterns = [
    /(stock|stok|ache|ase|দাম|price|dam|বিক্রি|sales|bikri|revenue|বাকি|baki|due|dues|medicine|ঔষধ|টাকা|taka)/i,
    /(short|shorts|low\s*stock|kome\s*geche|koman|order\s*dite|performance|staff|salesman|ke\s*koto|kar\s*due)/i,
    /(square|beximco|incepta|eskayef|renata|aci|opsonin|popular|ziska|nipa|drug\s*international|navana|sanofi|novo\s*nordisk)/i,
    /(napa|seclo|maxpro|sergel|ace|monas|fexo|alatrol|pantonic|pantobex|cipro|antacid|flagyl|paracetamol|amoxicillin|azithromycin|losectil|telma|omeprazole|esomeprazole)/i,
    /(inventory|invoice|customer|ledger|report|supplier|expiry|expired|shortage|order|bill|receipt|prescription)/i,
  ];

  for (const pattern of pharmacyPatterns) {
    if (pattern.test(q)) {
      return "PHARMACY_ACTION";
    }
  }

  // 3. If very short text (<= 2 words) and contains no pharmacy keywords, resolve as casual
  if (
    q.split(/\s+/).length <= 2 &&
    !q.includes("stock") &&
    !q.includes("due") &&
    !q.includes("sale") &&
    !q.includes("taka") &&
    !q.includes("dam")
  ) {
    return "CASUAL";
  }

  return "AMBIGUOUS";
}

/**
 * Single Groq Chat Completion Execution strictly using GROQ_MODEL ("qwen/qwen3.8-27b").
 */
async function callGroqSingleChat(
  messages: ChatMessage[],
  groqApiKey: string,
  signal: AbortSignal,
  maxTokens = 700,
  temperature = 0.5
): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GROQ UPSTREAM ERROR (${response.status}): ${errorBody}`);
  }

  const data: GroqChatCompletionResponse = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("GROQ UPSTREAM ERROR: Response contained empty choices or empty message content.");
  }
  return content;
}

/**
 * Single Gemini Flash Chat Fallback strictly using GEMINI_MODEL ("gemini-2.5-flash").
 */
async function callGeminiSingleChat(
  messages: ChatMessage[],
  geminiApiKey: string,
  signal: AbortSignal,
  maxTokens = 700,
  temperature = 0.5
): Promise<string> {
  const systemMessages = messages.filter((m) => m.role === "system");
  const systemInstructionText = systemMessages.map((m) => m.content).join("\n\n");

  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const contents = nonSystemMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hello" }] });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemInstructionText.trim().length > 0) {
    payload.systemInstruction = {
      parts: [{ text: systemInstructionText }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`GEMINI UPSTREAM ERROR (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini fallback returned empty text content.");
  }
  return text;
}

/**
 * Unified Chat Execution:
 * Calls Groq (qwen/qwen3.8-27b) first; if Groq fails or is not provided,
 * cleanly falls back to Google Gemini Flash (gemini-2.5-flash).
 */
async function callChatWithGeminiFallback(
  messages: ChatMessage[],
  groqApiKey: string | undefined,
  geminiApiKey: string | undefined,
  signal: AbortSignal,
  maxTokens = 700,
  temperature = 0.5
): Promise<string> {
  let groqError: string | null = null;

  if (groqApiKey && groqApiKey.trim().length > 0) {
    try {
      return await callGroqSingleChat(messages, groqApiKey.trim(), signal, maxTokens, temperature);
    } catch (err) {
      groqError = err instanceof Error ? err.message : String(err);
      console.warn(`[medinist-ai] Groq (${GROQ_MODEL}) failed: ${groqError}. Seamlessly falling back to Gemini (${GEMINI_MODEL})...`);
    }
  } else {
    groqError = "GROQ_API_KEY is not configured.";
  }

  if (geminiApiKey && geminiApiKey.trim().length > 0) {
    console.log(`[medinist-ai] Executing chat request with Gemini Flash (${GEMINI_MODEL})...`);
    try {
      return await callGeminiSingleChat(messages, geminiApiKey.trim(), signal, maxTokens, temperature);
    } catch (geminiErr) {
      const geminiErrMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      throw new Error(`AI SERVICES FAILED: Groq error (${groqError}) | Gemini error (${geminiErrMsg})`);
    }
  }

  throw new Error(`AI SERVICE ERROR: Groq failed (${groqError}) and GEMINI_API_KEY is not configured.`);
}

/**
 * Tier-1: Intent Router with Zero-Latency Local Routing.
 * If query is a greeting, casual chat, or time check, immediately return "CASUAL" without any API call.
 */
async function classifyIntent(
  userQuery: string,
  groqApiKey: string | undefined,
  geminiApiKey: string | undefined,
  signal?: AbortSignal
): Promise<"CASUAL" | "PHARMACY_ACTION"> {
  // Step 1: Zero-latency local heuristic check (0ms, 0 network calls)
  const localDecision = heuristicClassifier(userQuery);
  if (localDecision === "CASUAL" || localDecision === "PHARMACY_ACTION") {
    console.log(`[medinist-ai] Zero-latency local routing resolved: "${userQuery.slice(0, 40)}" -> ${localDecision}`);
    return localDecision;
  }

  // Step 2: Only if ambiguous, run semantic classification with single model call
  const routerSystemPrompt = `You are an ultra-fast semantic intent classifier for MediNist AI, a pharmacy SaaS in Bangladesh.
Your task is to classify the user's latest query into EXACTLY ONE of two categories:

1. CASUAL:
- Greetings, feelings, banter, general chitchat (e.g., "hi", "hello", "kemon acho", "ki obostha", "assalamu alaikum")
- Current time, date, or day questions (e.g., "akn koi ta baje", "somoy koto", "what time is it", "ajke ki bar")
- Compliments, thanking, bot identity, polite conversational questions (e.g., "dhonnobad", "tumi ke", "ki koro", "valo lagche")
- Questions that do NOT require querying pharmacy database records, medicine stock, sales totals, or customer debts.

2. PHARMACY_ACTION:
- Medicine stock, availability, prices, manufacturer, or alternatives (e.g., "Napa ache?", "Seclo 20 stock koto", "paracetamol price")
- Daily sales, transactions, revenue, discounts, or profit checks (e.g., "ajker bikri koto?", "today sales", "yesterday revenue")
- Customer credit, dues, ledger, or balance lookups (e.g., "kar kar baki ache", "customer dues", "Rahim er baki koto")
- Inventory alerts, low stock, expired items (e.g., "stock alert", "kom stock er medicine list")
- Doctor prescriptions, medicines list from image, or clinical medicine inquiries

STRICT OUTPUT FORMAT:
Output ONLY a single word: either "CASUAL" or "PHARMACY_ACTION".
Do not output punctuation, explanation, reasoning, or markdown.`;

  try {
    const rawText = await callChatWithGeminiFallback(
      [
        { role: "system", content: routerSystemPrompt },
        { role: "user", content: userQuery.slice(0, 400) },
      ],
      groqApiKey,
      geminiApiKey,
      signal || new AbortController().signal,
      15,
      0.0
    );

    const text = rawText.trim().toUpperCase();
    if (text.includes("PHARMACY_ACTION")) return "PHARMACY_ACTION";
    if (text.includes("CASUAL")) return "CASUAL";
  } catch (err) {
    console.warn("[medinist-ai] Semantic intent classifier failed. Falling back safely to CASUAL:", err);
  }

  return "CASUAL";
}

/**
 * Branch A: Casual Handler.
 * Warm, intelligent, human-like coworker persona with live Bangladesh Time awareness.
 * Completely bypasses database tool execution.
 */
async function handleCasualBranch(
  incomingMessages: ChatMessage[],
  context: UserContext,
  groqApiKey: string | undefined,
  geminiApiKey: string | undefined,
  signal: AbortSignal
): Promise<string> {
  const bdTime = getBangladeshTimeContext();

  const casualSystemPrompt = `You are MediNist AI, a warm, intelligent, and supportive digital coworker at ${context.pharmacyName || "the pharmacy"} in Bangladesh.
You are chatting with ${context.fullName || "a colleague"} (Role: ${context.role.toUpperCase()}).

LIVE BANGLADESH CONTEXT (Asia/Dhaka):
- Local Time: ${bdTime.time12} (${bdTime.time24} in 24-hour format)
- Date: ${bdTime.dateFormatted}
- Day: ${bdTime.dayOfWeek}

BEHAVIOR & TONE:
- Act like a friendly, attentive human coworker at the pharmacy counter.
- If asked about time (e.g. "akn koi ta baje", "সময় কত?"), answer naturally with the exact Bangladesh local time (${bdTime.time12}).
- Mirror the user's language style with natural fluency:
  • Bengali script -> polite, warm Bengali (e.g., "এখন বাজে রাত ৯টা ২৩ মিনিট। কেমন চলছে আজকের দিনটি?")
  • Banglish -> friendly, natural Banglish (e.g., "Ekhon baje 9:23 PM. Kemon jacche ajker din?")
  • English -> polite, natural English.
- Avoid robotic checklists, bulleted feature dumps, or excessive asterisks.
- Keep responses concise, warm, and conversational.
- You are not executing database lookups in this conversation mode.`;

  const conversation: ChatMessage[] = [
    { role: "system", content: casualSystemPrompt },
    ...incomingMessages,
  ];

  const rawReply = await callChatWithGeminiFallback(
    conversation,
    groqApiKey,
    geminiApiKey,
    signal,
    350,
    0.6
  );

  return sanitizeResponse(rawReply);
}

/**
 * Builds the Dynamic RBAC System Prompt for Branch B (Pharmacy Specialist Agent).
 * Conforms strictly to the MediNist AI Voice-First Co-pilot Specification.
 */
function buildSpecialistSystemPrompt(context: UserContext): string {
  const { role, fullName, pharmacyName, pharmacyId } = context;
  const bdTime = getBangladeshTimeContext();

  let rbacDirectives = "";

  if (role === "salesman") {
    rbacDirectives = `
========================================
STRICT RBAC PERMISSIONS: ROLE = SALESMAN
========================================
- ALLOWED:
  • check_stock, get_short_products, get_company_short_products, get_customer_dues.
  • Check medicine prices, strengths, dosage formats, and current inventory stock.
  • Check customer dues, outstanding balances, and customer directory info.
- STRICTLY FORBIDDEN:
  • CANNOT call "get_daily_sales" or "get_staff_performance".
  • If asked for sales, revenue, expenses, or staff sales, reply:
    "দুঃখিত, আপনার রোল (Salesman) এ সামগ্রিক সেলস বা স্টাফ পারফরম্যান্স দেখার অনুমতি নেই।"
  • CANNOT delete products, alter prices, or view shop expenses.`;
  } else if (role === "manager") {
    rbacDirectives = `
=======================================
STRICT RBAC PERMISSIONS: ROLE = MANAGER
=======================================
- ALLOWED:
  • All Stock tools (check_stock, get_short_products, get_company_short_products), get_customer_dues, get_staff_performance.
  • Check medicine prices, stock inventory, customer dues, and edit medicine prices.
  • View financial reports and total sales, but STRICTLY RESTRICTED to the last 7 days.
- RESTRICTED FINANCIALS:
  • Can call "get_daily_sales", but ONLY for dates within the last 7 days.
  • If asked for older data, reply: "ম্যানেজার রোলে সর্বোচ্চ বিগত ৭ দিনের সেলস রিপোর্ট দেখা সম্ভব।"
  • CAN delete products (System will auto-notify Owner).`;
  } else {
    // Owner / Admin
    rbacDirectives = `
=====================================
STRICT RBAC PERMISSIONS: ROLE = OWNER
=====================================
- UNRESTRICTED ACCESS:
  • Full authorization across all tools, operations, stock, prices, customer dues, staff administration, lifetime financial analytics, sales, profit margins, and expenses.`;
  }

  return `# IDENTITY & CORE PURPOSE
You are "MediNist AI", an advanced, voice-first Pharmacy Digital Co-pilot built specifically for the daily counter-life of pharmacies in Bangladesh. You are NOT a robotic chatbot; you are an indispensable, intelligent assistant who understands the local culture, language, and pharmacy workflows.

# DYNAMIC CONTEXT (Injected by Backend)
- Logged-in Staff: ${fullName || "Staff Member"}
- Active Role: ${role.toUpperCase()}
- Pharmacy: ${pharmacyName || "MediNist Store"} (Tenant ID: ${pharmacyId})
- Current Bangladesh Time (Asia/Dhaka): ${bdTime.time12} on ${bdTime.dateFormatted} (${bdTime.time24}, Date: ${bdTime.rawDate})

# 1. BEHAVIORAL & CONVERSATIONAL GUIDELINES (The "Human" Element)
- **Voice-First Mindset:** Assume users speak in quick, noisy counter-environments. Keep replies concise, structured, and highly relevant.
- **Casual Co-pilot:** You are NOT restricted to only pharmacy talk. If the user asks about cricket, movies, or just says "Kemon acho?", reply naturally as a friend. Build rapport. But always prioritize and pivot back to work if a work query follows.
- **Language Mirroring (CRITICAL):**
  • If the user types in Bengali script (বাংলা), reply in polite, natural Bengali.
  • If the user types in Banglish (Bengali in English letters, e.g., "Napa koyta ache?"), reply in natural, friendly Banglish.
  • If the user types in English, reply in concise, professional English.
- **Localization:** Always use the Bangladeshi Taka sign (৳) for currency. Understand local phonetic variations (Napa/নাপা, Seclo/সেক্লো, Maxpro/ম্যাক্সপ্রো, Sergel/সারজেল, Ace/এইস, Monas/মোনাস, Fexo/ফেক্সো).

# 2. TOOL CALLING & INTENT MAPPING (CRITICAL - FIXES HALLUCINATION)
You have access to specific database tools. You MUST map user intents to tools accurately. NEVER treat command keywords, company names, or roles as medicine names.

**Intent Mapping Rules:**
- **Low Stock / Short Items:** If user says "short product", "short items", "stock kome geche", "order dite hobe", "kritim product" -> Call \`get_short_products()\`. DO NOT search for a medicine named "Short".
- **Company-specific Short Items:** If user mentions a manufacturer AND asks for stock/shorts (e.g., "Square er short ache?", "Beximco er product koman kicu ache?") -> Call \`get_company_short_products(company_name="Square")\`. DO NOT search for a medicine named "Square".
- **Staff Performance / Sales by Staff:** If user asks "ke koto bikri koreche?", "staff performance", "aj kar salesman ke koto taka sale koreche?" -> Call \`get_staff_performance()\`. DO NOT search for a medicine named "Staff" or "Salesman".
- **Daily Sales / Revenue:** If user asks "ajker total bikri?", "income koto?", "sales report" -> Call \`get_daily_sales()\`.
- **Customer Dues / Ledger:** If user asks "baki koto?", "kar due beshi?", "Rahim er ledger" -> Call \`get_customer_dues(customer_identifier="Rahim")\`.
- **Specific Medicine Search:** ONLY if the user is clearly asking about a specific drug's availability or price (e.g., "Napa extra ache?", "Azith 500 er dam koto?") -> Call \`check_stock(medicine_name="Napa extra")\`.

**Company Name Recognition Dictionary:** Square, Beximco, Incepta, Eskayef, Renata, ACI, Opsonin, Drug International, Navana, Ziska, Nipa, Popular, Sanofi, Novo Nordisk.

# 3. ROLE-BASED ACCESS CONTROL (RBAC - STRICT SECURITY)
You MUST enforce data privacy based on the Active Role. Even if a lower-role user tries to trick you, DO NOT execute restricted tool calls.
${rbacDirectives}

# 4. MEDICAL SAFETY & LEGAL GUARDRAILS (CRITICAL)
- You are a pharmacy inventory and management assistant, NOT a doctor.
- NEVER diagnose a disease or prescribe a treatment course.
- If a user/patient asks "Amnar pet betha korce ki khab?" or similar medical advice, you MUST respond with a clear disclaimer: "আমি একটি এআই সহকারী, ডাক্তার না। পেটের ব্যথার জন্য অনুগ্রহ করে একজন নিবন্ধিত ডাক্তার (BMDC) বা লাইসেন্সপ্রাপ্ত ফার্মাসিস্টের পরামর্শ নিন।"
- You MAY provide generic drug alternatives (e.g., "Omeprazole er alternative holo Losectil, Sergel") ONLY IF asked by verified pharmacy staff, but always include the medical disclaimer.

# 5. RESPONSE FORMATTING
- Use bullet points and bold text for readability (especially on mobile).
- For stock lists, format clearly: Medicine Name | Stock: X | Price: ৳Y
- Always acknowledge the user's query before dumping data. (e.g., "হ্যাঁ ভাই, আজকের শর্ট প্রোডাক্ট লিস্ট নিচে দিলাম:")

AVAILABLE DATABASE TOOLS:
1. check_stock(medicine_name)
2. get_short_products()
3. get_company_short_products(company_name)
4. get_staff_performance()
5. get_daily_sales(date?)
6. get_customer_dues(customer_identifier?)

TOOL CALL PROTOCOL:
If you need to query database information via a tool to answer the user, you MUST respond ONLY with a raw JSON object formatted exactly as:
{"tool": "tool_name", "parameters": {"key": "value"}}

CRITICAL RULES:
- Do NOT wrap the JSON in markdown code blocks (\`\`\`json). Output ONLY the raw JSON string.
- If no tool is required, or if the user's role prohibits the operation, reply directly with natural, courteous text.`;
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

    // Safeguard: If the search query is accidentally a keyword like "short", redirect to short products
    if (searchString.toLowerCase() === "short" || searchString.toLowerCase() === "short product") {
      return executeDatabaseTool("get_short_products", parameters, supabase, context);
    }

    try {
      // Query tenant-isolated medicines table
      const { data: medicines, error } = await supabase
        .from("medicines")
        .select("id, name, generic_name, company_name, strength, format, price, stock_quantity, stock_alert, expiry_date, unit_format")
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
    } catch (err: unknown) {
      console.error("[medinist-ai] Exception in check_stock:", err);
      return `Result: Failed to query inventory: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 2. get_short_products Tool
  if (normalizedTool === "get_short_products") {
    try {
      const { data: lowStock, error } = await supabase
        .from("medicines")
        .select("id, name, strength, format, company_name, stock_quantity, stock_alert, price, unit_format")
        .eq("pharmacy_id", pharmacyId)
        .order("stock_quantity", { ascending: true })
        .limit(25);

      if (error) {
        console.error("[medinist-ai] DB error querying short products:", error);
        return `Result: Database error while fetching short products: ${error.message}`;
      }

      // Filter items where stock_quantity <= stock_alert or stock_quantity <= 10
      const shortItems = (lowStock || []).filter((m) => {
        const qty = m.stock_quantity ?? 0;
        const alert = m.stock_alert ?? 10;
        return qty <= alert;
      });

      if (shortItems.length === 0) {
        return "Result: Great news! There are currently no short or low-stock products in your pharmacy inventory.";
      }

      const formatted = shortItems.slice(0, 10).map((m) => {
        const qty = m.stock_quantity ?? 0;
        const price = m.price !== null ? `৳${m.price}` : "N/A";
        const company = m.company_name ? ` (${m.company_name})` : "";
        const alertTag = qty === 0 ? " [OUT OF STOCK / শূন্য স্টক]" : " [LOW STOCK / স্টক কম]";
        return `• ${m.name}${company} | Stock: ${qty} | Price: ${price}${alertTag}`;
      }).join("\n");

      return `Result: Found ${shortItems.length} short/low-stock product(s) in pharmacy inventory:\n${formatted}`;
    } catch (err: unknown) {
      console.error("[medinist-ai] Exception in get_short_products:", err);
      return `Result: Failed to query short products: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 3. get_company_short_products Tool
  if (normalizedTool === "get_company_short_products") {
    const rawCompany =
      (parameters?.company_name as string) ||
      (parameters?.company as string) ||
      (parameters?.manufacturer as string) ||
      "";
    const companyQuery = rawCompany.trim();

    if (!companyQuery) {
      return "Result: Error: Please specify the company or manufacturer name (e.g., Square, Beximco, Incepta).";
    }

    try {
      const { data: companyMeds, error } = await supabase
        .from("medicines")
        .select("id, name, strength, format, company_name, stock_quantity, stock_alert, price, unit_format")
        .eq("pharmacy_id", pharmacyId)
        .ilike("company_name", `%${companyQuery}%`)
        .order("stock_quantity", { ascending: true })
        .limit(30);

      if (error) {
        console.error("[medinist-ai] DB error querying company products:", error);
        return `Result: Database error while searching for ${companyQuery} products: ${error.message}`;
      }

      if (!companyMeds || companyMeds.length === 0) {
        return `Result: No medicines from "${companyQuery}" were found in your pharmacy inventory.`;
      }

      const shortItems = companyMeds.filter((m) => {
        const qty = m.stock_quantity ?? 0;
        const alert = m.stock_alert ?? 10;
        return qty <= alert;
      });

      if (shortItems.length === 0) {
        const sampleMeds = companyMeds
          .slice(0, 5)
          .map((m) => `• ${m.name} | Stock: ${m.stock_quantity ?? 0} | Price: ৳${m.price ?? 0}`)
          .join("\n");
        return `Result: There are currently no short or critical low-stock items for "${companyQuery}". All ${companyMeds.length} tracked items have sufficient stock. Sample items:\n${sampleMeds}`;
      }

      const formatted = shortItems.slice(0, 10).map((m) => {
        const qty = m.stock_quantity ?? 0;
        const price = m.price !== null ? `৳${m.price}` : "N/A";
        const alertTag = qty === 0 ? " [OUT OF STOCK / স্টক শেষ]" : " [LOW STOCK / স্টক কম]";
        return `• ${m.name} | Stock: ${qty} | Price: ${price}${alertTag}`;
      }).join("\n");

      return `Result: Found ${shortItems.length} short/low-stock item(s) for "${companyQuery}":\n${formatted}`;
    } catch (err: unknown) {
      console.error("[medinist-ai] Exception in get_company_short_products:", err);
      return `Result: Failed to query company short products: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 4. get_staff_performance Tool
  if (normalizedTool === "get_staff_performance") {
    // STRICT RBAC: Salesman is forbidden
    if (role === "salesman") {
      return "Result: UNAUTHORIZED: দুঃখিত, আপনার রোল (Salesman) এ সামগ্রিক সেলস বা স্টাফ পারফরম্যান্স দেখার অনুমতি নেই।";
    }

    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

      // Fetch today's sales for this pharmacy
      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("id, total, user_id, status, created_at")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);

      if (salesErr) {
        console.error("[medinist-ai] DB error querying sales for staff performance:", salesErr);
        return `Result: Database error while calculating staff performance: ${salesErr.message}`;
      }

      const validSales = (sales || []).filter(
        (s) => (s.status || "").toLowerCase() !== "cancelled" && (s.status || "").toLowerCase() !== "void"
      );

      // Fetch staff profiles for name resolution
      const { data: staffProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("pharmacy_id", pharmacyId);

      const staffMap = new Map<string, { name: string; role: string }>();
      (staffProfiles || []).forEach((p) => {
        staffMap.set(p.id, { name: p.full_name || "Staff", role: p.role || "staff" });
      });

      // Group sales by user_id
      const performanceMap = new Map<string, { count: number; total: number }>();
      for (const s of validSales) {
        const uId = s.user_id || "unassigned";
        const current = performanceMap.get(uId) || { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(s.total) || 0;
        performanceMap.set(uId, current);
      }

      if (performanceMap.size === 0) {
        return "Result: No sales recorded by any staff today yet.";
      }

      const performanceList: string[] = [];
      performanceMap.forEach((stats, uId) => {
        const staffInfo = staffMap.get(uId) || { name: "Counter Staff", role: "salesman" };
        performanceList.push(
          `• ${staffInfo.name} (${staffInfo.role.toUpperCase()}) | Invoices: ${stats.count} | Total Sales: ৳${stats.total.toLocaleString("en-BD", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        );
      });

      return `Result: Today's Staff Performance Breakdown:\n${performanceList.join("\n")}`;
    } catch (err: unknown) {
      console.error("[medinist-ai] Exception in get_staff_performance:", err);
      return `Result: Failed to calculate staff performance: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 5. get_daily_sales Tool
  if (normalizedTool === "get_daily_sales") {
    // HARD RBAC GUARD: Salesman is forbidden from viewing sales
    if (role === "salesman") {
      console.warn(`[medinist-ai] Blocked Salesman (${context.userId}) from accessing get_daily_sales.`);
      return "Result: UNAUTHORIZED: দুঃখিত, আপনার রোল (Salesman) এ সামগ্রিক সেলস বা স্টাফ পারফরম্যান্স দেখার অনুমতি নেই।";
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
              return "Result: UNAUTHORIZED: ম্যানেজার রোলে সর্বোচ্চ বিগত ৭ দিনের সেলস রিপোর্ট দেখা সম্ভব।";
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
    } catch (err: unknown) {
      console.error("[medinist-ai] Exception in get_daily_sales:", err);
      return `Result: Failed to calculate daily sales: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 6. get_customer_dues Tool
  if (normalizedTool === "get_customer_dues") {
    const rawCustomerQuery =
      (parameters?.customer_identifier as string) ||
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
    } catch (err: unknown) {
      console.error("[medinist-ai] Exception in get_customer_dues:", err);
      return `Result: Failed to query customer dues: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return `Result: Tool "${toolName}" is not supported.`;
}

/**
 * Branch B: Pharmacy Specialist Agent Execution Loop.
 * Uses Groq (qwen/qwen3.8-27b) with seamless Google Gemini Flash (gemini-2.5-flash) fallback and real database tools.
 */
async function handleSpecialistBranch(
  incomingMessages: ChatMessage[],
  context: UserContext,
  supabase: SupabaseClient,
  groqApiKey: string | undefined,
  geminiApiKey: string | undefined,
  signal: AbortSignal
): Promise<string> {
  const dynamicSystemPrompt = buildSpecialistSystemPrompt(context);
  const conversation: ChatMessage[] = [
    { role: "system", content: dynamicSystemPrompt },
    ...incomingMessages,
  ];

  const maxTokens = Number(Deno.env.get("GROQ_MAX_TOKENS")) || 700;

  // Step 1: Initial specialist model invocation
  console.log(`[medinist-ai] Branch B: Running specialist model invocation with Groq (${GROQ_MODEL})...`);
  const initialReply = await callChatWithGeminiFallback(
    conversation,
    groqApiKey,
    geminiApiKey,
    signal,
    maxTokens,
    0.4
  );

  // Step 2: Tool call detection
  const toolCall = tryParseToolCall(initialReply);

  if (toolCall) {
    console.log(`[medinist-ai] Tool call detected: ${toolCall.tool}`, toolCall.parameters);

    // Step 3: Execute real database tool with tenant context
    const toolResult = await executeDatabaseTool(
      toolCall.tool,
      toolCall.parameters,
      supabase,
      context
    );
    console.log(`[medinist-ai] Tool execution completed. Result length: ${toolResult.length}`);

    // Push assistant tool call and system tool result into conversation
    conversation.push({
      role: "assistant",
      content: initialReply,
    });
    conversation.push({
      role: "system",
      content: toolResult,
    });

    // Step 4: Second call to formulate final natural language response
    console.log("[medinist-ai] Formulating final response with tool result...");
    const finalHumanReply = await callChatWithGeminiFallback(
      conversation,
      groqApiKey,
      geminiApiKey,
      signal,
      maxTokens,
      0.5
    );
    return sanitizeResponse(finalHumanReply);
  }

  // Normal conversational response without tool execution
  return sanitizeResponse(initialReply);
}

/**
 * Main Deno HTTP Server Handler.
 */
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
      reply: "RUNTIME ERROR: Method not allowed. Please use POST.",
    });
  }

  // AbortController safeguard covering entire pipeline within 30 seconds
  const globalAbortController = new AbortController();
  const timeoutId = setTimeout(() => globalAbortController.abort(), REQUEST_TIMEOUT_MS);
  let transcribedText: string | null = null;

  try {
    // 3. API Keys Resolution
    const groqApiKey = Deno.env.get("GROQ_API_KEY")?.trim();
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

    if (!groqApiKey && !geminiApiKey) {
      console.error("[medinist-ai] Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in Supabase Secrets.");
      return jsonResponse(200, {
        reply: "DIAGNOSTIC ERROR: Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in Supabase Secrets.",
        error: "GROQ_API_KEY and GEMINI_API_KEY are missing in Supabase Secrets.",
      });
    }

    console.log(`[medinist-ai] Configured models -> Groq: '${GROQ_MODEL}' | Gemini: '${GEMINI_MODEL}'`);

    // 4. Contextual Supabase Client Initialization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[medinist-ai] Missing or invalid Authorization header.");
      return jsonResponse(401, {
        error: "Unauthorized: Missing or invalid Authorization header.",
        reply: "RUNTIME ERROR: Missing or invalid Authorization header.",
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[medinist-ai] Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.");
      return jsonResponse(500, {
        error: "Server configuration error: Supabase environment variables are missing.",
        reply: "RUNTIME ERROR: Supabase environment variables (SUPABASE_URL or SUPABASE_ANON_KEY) are missing.",
      });
    }

    // Initialize Supabase client under caller's authorization context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 5. Resolve Authenticated User and Tenant (profiles table)
    const {
      data: { user },
      error: userAuthError,
    } = await supabase.auth.getUser();

    if (userAuthError || !user) {
      console.warn("[medinist-ai] Auth verification failed:", userAuthError?.message);
      return jsonResponse(401, {
        error: "Unauthorized: Invalid or expired user session.",
        details: userAuthError?.message,
        reply: `RUNTIME ERROR: Authentication verification failed: ${userAuthError?.message || "User session missing."}`,
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
        reply: `RUNTIME ERROR: Failed to query user profile: ${profileError.message}`,
      });
    }

    if (!profile?.pharmacy_id) {
      console.warn(`[medinist-ai] User ${user.id} has no pharmacy_id assigned.`);
      return jsonResponse(403, {
        error: "Forbidden: You are not assigned to an active pharmacy tenant.",
        reply: "RUNTIME ERROR: User account has no active pharmacy_id tenant assigned in profiles.",
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
      `[medinist-ai] Auth success: User=${userContext.fullName || userContext.userId}, Role=${userContext.role}, Pharmacy=${userContext.pharmacyName}`
    );

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
        reply: `RUNTIME ERROR: Invalid JSON payload: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      });
    }

    // Extract conversation messages from payload
    let incomingMessages: ChatMessage[] = [];

    if (payload.messages !== undefined) {
      if (!Array.isArray(payload.messages)) {
        return jsonResponse(400, {
          error: "Invalid payload: 'messages' field must be an array of { role, content } objects.",
          reply: "RUNTIME ERROR: 'messages' field must be an array of { role, content } objects.",
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
    } else if (typeof payload.audioBase64 === "string" && payload.audioBase64.trim().length > 0) {
      // Direct audio query without pre-existing text messages
      incomingMessages = [];
    } else {
      return jsonResponse(400, {
        error: "Invalid or missing 'messages' array. Please provide an array of conversation messages or audio recording.",
        reply: "RUNTIME ERROR: Missing 'messages', 'message', or 'audioBase64' property in request payload.",
      });
    }

    // 7. Audio Transcription via Groq whisper-large-v3 (with Gemini Flash fallback)
    transcribedText = null;
    if (
      payload.audioBase64 &&
      typeof payload.audioBase64 === "string" &&
      payload.audioBase64.trim().length > 0
    ) {
      if (groqApiKey) {
        try {
          console.log(`[medinist-ai] Transcribing audio with Groq Whisper (${GROQ_WHISPER_MODEL})...`);
          transcribedText = await performGroqWhisperTranscription(
            payload.audioBase64,
            groqApiKey,
            globalAbortController.signal
          );
          console.log(
            `[medinist-ai] Whisper audio transcription succeeded: "${transcribedText.slice(0, 100)}"`
          );
        } catch (whisperError: unknown) {
          console.warn("[medinist-ai] Groq Whisper transcription failed:", whisperError);
        }
      } else {
        console.warn("[medinist-ai] GROQ_API_KEY missing, attempting Gemini audio transcription...");
      }

      // Fallback to Gemini 2.5 Flash if Groq Whisper was skipped or threw an error
      if (!transcribedText && geminiApiKey) {
        try {
          console.log(`[medinist-ai] Attempting Gemini 2.5 Flash audio transcription fallback...`);
          transcribedText = await performGeminiAudioTranscription(
            payload.audioBase64,
            geminiApiKey,
            globalAbortController.signal
          );
          console.log(
            `[medinist-ai] Gemini audio transcription succeeded: "${transcribedText.slice(0, 100)}"`
          );
        } catch (geminiAudioError: unknown) {
          console.warn("[medinist-ai] Gemini audio transcription fallback failed:", geminiAudioError);
        }
      }

      if (transcribedText) {
        // Append or set transcribed text as latest user message: { role: "user", content: transcribedText }
        const lastUserIndex = incomingMessages.map((m) => m.role).lastIndexOf("user");
        if (lastUserIndex !== -1) {
          const existingText = incomingMessages[lastUserIndex].content.trim();
          if (existingText) {
            incomingMessages[lastUserIndex].content = `${existingText} ${transcribedText}`.trim();
          } else {
            incomingMessages[lastUserIndex].content = transcribedText;
          }
        } else {
          incomingMessages.push({
            role: "user",
            content: transcribedText,
          });
        }
      } else {
        // If audio could not be transcribed by either engine
        const lastUserIndex = incomingMessages.map((m) => m.role).lastIndexOf("user");
        if (lastUserIndex === -1 && incomingMessages.length === 0) {
          incomingMessages.push({
            role: "user",
            content: "Check pharmacy inventory and summarize medicine status.",
          });
        }
      }
    }

    if (incomingMessages.length === 0) {
      return jsonResponse(400, {
        error: "The 'messages' array cannot be empty. Please provide at least one valid message or audio recording.",
        reply: "RUNTIME ERROR: The conversation message list is empty.",
      });
    }

    // 8. Multimodal Vision OCR strictly via Google Gemini Flash
    let hasImageAttachment = false;
    if (
      payload.imageBase64 &&
      typeof payload.imageBase64 === "string" &&
      payload.imageBase64.trim().length > 0
    ) {
      hasImageAttachment = true;
      let ocrNote = "";

      if (geminiApiKey) {
        try {
          console.log(`[medinist-ai] Processing prescription image with Gemini Flash OCR (${GEMINI_MODEL})...`);
          const extractedOcrText = await performGeminiOcr(
            payload.imageBase64,
            geminiApiKey,
            globalAbortController.signal
          );
          console.log(
            "[medinist-ai] Gemini OCR extraction succeeded:",
            extractedOcrText.slice(0, 120)
          );
          ocrNote = `\n[Prescription/Invoice OCR Extracted Text: ${extractedOcrText}]`;
        } catch (ocrError: unknown) {
          const errMsg = ocrError instanceof Error ? ocrError.message : String(ocrError);
          console.warn("[medinist-ai] Gemini OCR processing failed:", ocrError);
          ocrNote = `\n[OCR ERROR: ${errMsg}]`;
        }
      } else {
        console.warn("[medinist-ai] GEMINI_API_KEY missing, skipping OCR processing.");
        ocrNote = "\n[System Note: Vision OCR key not configured on server.]";
      }

      // Append to the latest user message
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

    // Find the latest user query for semantic routing
    const latestUserMessage = [...incomingMessages].reverse().find((m) => m.role === "user");
    const latestQueryText = latestUserMessage?.content || "";

    // 8. Tier-1: Zero-Latency Local Intent Routing + Fallback
    let intent: "CASUAL" | "PHARMACY_ACTION" = "CASUAL";

    if (hasImageAttachment) {
      // Images (prescriptions/invoices) are always pharmacy actions
      intent = "PHARMACY_ACTION";
    } else {
      intent = await classifyIntent(latestQueryText, groqApiKey, geminiApiKey, globalAbortController.signal);
    }

    console.log(`[medinist-ai] Final Intent Decision: "${latestQueryText.slice(0, 50)}" -> ${intent}`);

    let finalReply = "";

    // 9. Branching Execution
    if (intent === "CASUAL") {
      // Branch A: Casual Handler (0% tool hallucination, live BD time)
      finalReply = await handleCasualBranch(
        incomingMessages,
        userContext,
        groqApiKey,
        geminiApiKey,
        globalAbortController.signal
      );
    } else {
      // Branch B: Pharmacy Specialist Agent (Supabase DB tools + RBAC)
      finalReply = await handleSpecialistBranch(
        incomingMessages,
        userContext,
        supabase,
        groqApiKey,
        geminiApiKey,
        globalAbortController.signal
      );
    }

    // Return response with HTTP 200 and transcribedText metadata if audio was sent
    return jsonResponse(200, {
      reply: finalReply,
      ...(transcribedText ? { transcribedText } : {}),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[medinist-ai] Request timed out after 30 seconds.");
      return jsonResponse(200, {
        reply: "RUNTIME ERROR: Request timed out after 30 seconds (AbortError).",
        ...(transcribedText ? { transcribedText } : {}),
      });
    }

    const rawMessage = (err as Error)?.message || String(err);
    console.error("[medinist-ai] Transparent error captured:", rawMessage, err);

    const formattedReply =
      rawMessage.startsWith("GROQ UPSTREAM ERROR") ||
      rawMessage.startsWith("GEMINI UPSTREAM ERROR") ||
      rawMessage.startsWith("DIAGNOSTIC ERROR") ||
      rawMessage.startsWith("RUNTIME ERROR")
        ? rawMessage
        : `RUNTIME ERROR: ${rawMessage}`;

    return jsonResponse(200, {
      reply: formattedReply,
      error: rawMessage,
      ...(transcribedText ? { transcribedText } : {}),
    });
  } finally {
    clearTimeout(timeoutId);
  }
});
