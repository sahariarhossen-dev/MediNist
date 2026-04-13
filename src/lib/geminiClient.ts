import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Msg } from "@/components/ai/chatStore";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction:
    "You are a professional pharmacy assistant for Naseer Medical Hall. Help the owner manage inventory, sales, and medicine information.",
});

export async function streamChat({
  messages,
  onDelta,
  onDone,
}: {
  messages: Msg[];
  onDelta: (chunk: string) => void;
  onDone: () => void;
}) {
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
