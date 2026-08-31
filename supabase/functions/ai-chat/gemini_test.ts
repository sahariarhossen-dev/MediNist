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
  { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
  { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
  { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
];

Deno.test("normalizes bare and models-prefixed Gemini IDs", () => {
  assertEquals(normalizeGeminiModel("gemini-3.6-flash"), "gemini-3.6-flash");
  assertEquals(normalizeGeminiModel("models/gemini-3.6-flash"), "gemini-3.6-flash");
});

Deno.test("builds a generateContent URL with one models segment", () => {
  const expected = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
  assertEquals(buildGeminiGenerateUrl("gemini-3.6-flash"), expected);
  assertEquals(buildGeminiGenerateUrl("models/gemini-3.6-flash"), expected);
  assertThrows(() => buildGeminiGenerateUrl("models/models/gemini-3.6-flash"));
});

Deno.test("selects a configured supported model, then a safe Flash fallback", () => {
  assertEquals(selectGeminiModel(catalog, "models/gemini-2.5-flash-lite"), "gemini-2.5-flash-lite");
  assertEquals(selectGeminiModel(catalog, "gemini-1.5-flash"), "gemini-3.6-flash");
  assertEquals(selectGeminiModel([], "gemini-3.6-flash"), null);
});

Deno.test("skips excluded (retired) models", () => {
  assertEquals(
    selectGeminiModel(catalog, "gemini-3.6-flash", ["models/gemini-3.6-flash"]),
    "gemini-2.5-flash",
  );
  assertEquals(
    selectGeminiModel(catalog, null, ["gemini-3.6-flash", "gemini-2.5-flash"]),
    "gemini-2.5-flash-lite",
  );
});


Deno.test("redacts API keys from diagnostic URLs", () => {
  assertEquals(
    redactGeminiUrl("https://example.test/models/x:generateContent?key=secret-value"),
    "https://example.test/models/x:generateContent?key=REDACTED",
  );
});