import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildGeminiGenerateUrl,
  normalizeGeminiModel,
  redactGeminiUrl,
  selectGeminiModel,
} from "./gemini.ts";

const catalog = [
  { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
  { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
  { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
];

Deno.test("normalizes bare and models-prefixed Gemini IDs", () => {
  assertEquals(normalizeGeminiModel("gemini-2.5-flash"), "gemini-2.5-flash");
  assertEquals(normalizeGeminiModel("models/gemini-2.5-flash"), "gemini-2.5-flash");
});

Deno.test("builds a generateContent URL with one models segment", () => {
  const expected = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  assertEquals(buildGeminiGenerateUrl("gemini-2.5-flash"), expected);
  assertEquals(buildGeminiGenerateUrl("models/gemini-2.5-flash"), expected);
  assertThrows(() => buildGeminiGenerateUrl("models/models/gemini-2.5-flash"));
});

Deno.test("selects a configured supported model, then a safe Flash fallback", () => {
  assertEquals(selectGeminiModel(catalog, "models/gemini-2.5-flash-lite"), "gemini-2.5-flash-lite");
  assertEquals(selectGeminiModel(catalog, "gemini-1.5-flash"), "gemini-2.5-flash");
  assertEquals(selectGeminiModel([], "gemini-2.5-flash"), null);
});

Deno.test("redacts API keys from diagnostic URLs", () => {
  assertEquals(
    redactGeminiUrl("https://example.test/models/x:generateContent?key=secret-value"),
    "https://example.test/models/x:generateContent?key=REDACTED",
  );
});