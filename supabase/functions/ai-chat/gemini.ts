export const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_FLASH_PREFERENCES = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export interface GeminiModelRecord {
  name?: string;
  supportedGenerationMethods?: string[];
}

export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//, "").replace(/^\/+|\/+$/g, "");
}

export function buildGeminiGenerateUrl(model: string): string {
  const normalized = normalizeGeminiModel(model);
  if (!/^gemini-[a-z0-9.-]+$/i.test(normalized)) {
    throw new Error("Invalid Gemini model identifier");
  }
  return `${GEMINI_API_ROOT}/models/${normalized}:generateContent`;
}

export function selectGeminiModel(
  models: GeminiModelRecord[],
  configuredModel?: string | null,
): string | null {
  const available = new Set(
    models
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => normalizeGeminiModel(model.name ?? ""))
      .filter((name) => name.startsWith("gemini-")),
  );

  const configured = configuredModel ? normalizeGeminiModel(configuredModel) : "";
  if (configured && available.has(configured)) return configured;

  for (const model of GEMINI_FLASH_PREFERENCES) {
    if (available.has(model)) return model;
  }

  return [...available]
    .filter((name) => name.includes("flash") && !name.includes("image"))
    .sort()
    .reverse()[0] ?? null;
}

export function redactGeminiUrl(url: string): string {
  return url.replace(/([?&]key=)[^&]+/i, "$1REDACTED");
}