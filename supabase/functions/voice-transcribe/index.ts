import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) return json({ error: "GROQ_API_KEY not configured" }, 500);

    let file: File | null = null;
    let language: string | null = null;
    try {
      const form = await req.formData();
      const raw = form.get("file");
      if (raw instanceof File) file = raw;
      const lang = form.get("language");
      if (typeof lang === "string" && lang.length <= 8) language = lang;
    } catch {
      return json({ error: "Expected multipart/form-data with a `file` field." }, 400);
    }

    if (!file) return json({ error: "Audio file is required." }, 400);
    if (file.size === 0) return json({ error: "Recording was empty. Please try again." }, 400);
    if (file.size > MAX_AUDIO_BYTES) return json({ error: "Recording is too long." }, 400);
    if (!(file.type === "" || file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
      return json({ error: "Unsupported audio format." }, 400);
    }

    const outbound = new FormData();
    outbound.append("file", file, file.name || "voice.webm");
    outbound.append("model", GROQ_MODEL);
    outbound.append("response_format", "json");
    outbound.append("temperature", "0");
    if (language) outbound.append("language", language);

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: outbound,
    }).catch((error) => {
      console.error("voice-transcribe: groq fetch failed", String(error));
      return null;
    });

    if (!res) return json({ error: "Could not reach the transcription service." }, 504);

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // fall through — handled below
    }

    if (!res.ok) {
      console.error("voice-transcribe: groq error", res.status, text.slice(0, 500));
      return json(
        { error: data?.error?.message || "Transcription failed. Please try again.", code: res.status },
        200
      );
    }

    const transcript = typeof data?.text === "string" ? data.text.trim() : "";
    console.log("voice-transcribe: ok", JSON.stringify({ bytes: file.size, chars: transcript.length }));
    return json({ text: transcript });
  } catch (error) {
    console.error("voice-transcribe fatal:", String(error));
    return json({ error: "An internal error occurred. Please try again." }, 500);
  }
});
