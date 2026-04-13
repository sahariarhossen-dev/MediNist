import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Msg } from "@/components/ai/chatStore";

function getModel() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("API Key not found. Please check your settings.");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction:
      "You are a professional pharmacy assistant for Naseer Medical Hall. Help the owner manage inventory, sales, and medicine information.",
  });
}

export async function checkConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const model = getModel();
    const result = await model.generateContent("Say OK");
    const text = result.response.text();
    return { ok: !!text };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Connection failed" };
  }
}

export async function streamChat({
  messages,
  onDelta,
  onDone,
}: {
  messages: Msg[];
  onDelta: (chunk: string) => void;
  onDone: () => void;
}) {
  const model = getModel();

  const history = messages
    .filter((m) => m.role !== "assistant" || messages.indexOf(m) < messages.length - 1)
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  if (!lastUserMsg) throw new Error("No user message found");

  const chat = model.startChat({
    history: history.slice(0, -1),
  });

  const result = await chat.sendMessageStream(lastUserMsg.content);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) onDelta(text);
  }

  onDone();
}
