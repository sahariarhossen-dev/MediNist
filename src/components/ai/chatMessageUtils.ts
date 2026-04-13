type AssistantLikeMessage = {
  role?: string;
  content?: string | null;
};

const TRANSIENT_ASSISTANT_PREFIXES = [
  "⚠️ Gemini is temporarily rate-limited.",
  "⚠️ I couldn't reach the AI service right now.",
  "⚠️ I couldn't reach Gemini right now.",
  "⚠️ I received an empty AI response.",
  "⚠️ I ran into a temporary problem.",
  "⚠️ Failed to get response",
  "⚠️ Server error",
  "⚠️ Connection test failed",
] as const;

export const isTransientAssistantMessage = (message: AssistantLikeMessage) => {
  const content = message.content?.trim() ?? "";

  return (
    message.role === "assistant" &&
    TRANSIENT_ASSISTANT_PREFIXES.some((prefix) => content.startsWith(prefix))
  );
};

export const stripTransientAssistantMessages = <T extends AssistantLikeMessage>(messages: T[]) =>
  messages.filter((message) => !isTransientAssistantMessage(message));