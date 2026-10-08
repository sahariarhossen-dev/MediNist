import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function medinistAiDevPlugin(): Plugin {
  return {
    name: "medinist-ai-dev-endpoint",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/functions/v1/medinist-ai" || url === "/api/medinist-ai") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "authorization, x-client-info, apikey, content-type"
          );
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Method not allowed. Please use POST." }));
            return;
          }

          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const parsed = JSON.parse(body || "{}");
              let incomingMessages: Array<{ role: string; content: string }> = [];

              if (parsed.messages !== undefined) {
                if (!Array.isArray(parsed.messages)) {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  res.end(
                    JSON.stringify({
                      error: "Invalid payload: 'messages' field must be an array of { role, content } objects.",
                    })
                  );
                  return;
                }

                incomingMessages = parsed.messages
                  .filter(
                    (m: any) =>
                      typeof m === "object" &&
                      m !== null &&
                      (m.role === "user" || m.role === "assistant" || m.role === "system") &&
                      typeof m.content === "string" &&
                      m.content.trim().length > 0
                  )
                  .map((m: any) => ({
                    role: m.role,
                    content: m.content.trim(),
                  }));
              } else if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
                incomingMessages = [{ role: "user", content: parsed.message.trim() }];
              } else {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: "Invalid or missing 'messages' array.",
                  })
                );
                return;
              }

              if (incomingMessages.length === 0) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: "The 'messages' array cannot be empty.",
                  })
                );
                return;
              }

              // Multimodal Vision / OCR processing via Gemini API
              if (parsed.imageBase64 && typeof parsed.imageBase64 === "string" && parsed.imageBase64.trim().length > 0) {
                const geminiKey = process.env.GEMINI_API_KEY?.trim();
                let ocrNote = "";

                if (geminiKey) {
                  try {
                    let mimeType = "image/jpeg";
                    let rawBase64 = parsed.imageBase64.trim();
                    const match = rawBase64.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                      mimeType = match[1];
                      rawBase64 = match[2];
                    }

                    const modelsToTry = [
                      process.env.GEMINI_MODEL || "gemini-3.6-flash",
                      "gemini-1.5-flash",
                      "gemini-2.5-flash",
                    ];

                    let extractedText = "";
                    for (const gModel of modelsToTry) {
                      try {
                        const gRes = await fetch(
                          `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${geminiKey}`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              contents: [
                                {
                                  parts: [
                                    {
                                      text: "You are a medical OCR assistant. Read this prescription/medicine image and extract the medicine names, dosages, and instructions clearly.",
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
                          }
                        );

                        if (gRes.ok) {
                          const gData = await gRes.json();
                          const candidateText = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                          if (candidateText) {
                            extractedText = candidateText;
                            break;
                          }
                        }
                      } catch {}
                    }

                    if (extractedText) {
                      ocrNote = `\n[System Note: User uploaded an image. OCR Extracted Text: ${extractedText}]`;
                    } else {
                      ocrNote = "\n[System Note: Image upload failed to process.]";
                    }
                  } catch {
                    ocrNote = "\n[System Note: Image upload failed to process.]";
                  }
                } else {
                  ocrNote = "\n[System Note: Image upload failed to process.]";
                }

                const lastUserIdx = incomingMessages.map((m: any) => m.role).lastIndexOf("user");
                if (lastUserIdx !== -1) {
                  incomingMessages[lastUserIdx].content += ocrNote;
                } else {
                  incomingMessages.push({ role: "user", content: ocrNote.trim() });
                }
              }

              const systemPrompt =
                "You are MediNist AI. You have access to the following tools:\n\n" +
                "check_stock(medicine_name): Returns current inventory quantity.\n\n" +
                "get_daily_sales(): Returns today's total sales amount.\n\n" +
                'If you need to use a tool to answer the user, you MUST output ONLY a raw JSON object in this exact format: {"tool": "tool_name", "parameters": {"key": "value"}}. Do not add any markdown formatting or extra text. If no tool is needed, respond with natural conversational text.';

              const executeTool = (toolName: string, parameters?: Record<string, any>): string => {
                const norm = toolName.trim().toLowerCase();
                if (norm === "check_stock") {
                  const med =
                    parameters?.medicine_name ||
                    parameters?.medicine ||
                    parameters?.name ||
                    "the requested medicine";
                  return `Result: Stock for ${med} is 25 boxes.`;
                }
                if (norm === "get_daily_sales") {
                  return "Result: Today's sales total is 12,500 Taka.";
                }
                return "Result: Tool not found or data unavailable.";
              };

              const tryParseToolCall = (raw: string) => {
                if (!raw) return null;
                let cleaned = raw.trim();
                if (cleaned.startsWith("```")) {
                  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
                  cleaned = cleaned.replace(/\s*```$/, "");
                  cleaned = cleaned.trim();
                }
                const firstBrace = cleaned.indexOf("{");
                const lastBrace = cleaned.lastIndexOf("}");
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                  cleaned = cleaned.slice(firstBrace, lastBrace + 1);
                }
                try {
                  const parsed = JSON.parse(cleaned);
                  if (parsed && typeof parsed === "object" && typeof parsed.tool === "string") {
                    return {
                      tool: parsed.tool.trim(),
                      parameters: parsed.parameters || {},
                    };
                  }
                } catch {}
                return null;
              };

              const groqMessages = [
                { role: "system", content: systemPrompt },
                ...incomingMessages,
              ];

              const groqKey = process.env.GROQ_API_KEY?.trim();
              if (groqKey) {
                const callGroq = async (msgs: Array<{ role: string; content: string }>) => {
                  const perform = async (model: string, maxTokens: number = 300) => {
                    return await fetch(
                      "https://api.groq.com/openai/v1/chat/completions",
                      {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${groqKey}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          model,
                          messages: msgs,
                          temperature: 0.7,
                          max_tokens: maxTokens,
                        }),
                      }
                    );
                  };

                  const primaryModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
                  let res = await perform(primaryModel, 300);
                  if ((res.status === 404 || res.status === 429) && primaryModel !== "qwen/qwen3.8-27b") {
                    res = await perform("qwen/qwen3.8-27b", 256);
                  }
                  return res;
                };

                try {
                  let groqRes = await callGroq(groqMessages);

                  if (groqRes.ok) {
                    const groqData = await groqRes.json();
                    const initialReply = groqData.choices?.[0]?.message?.content?.trim();

                    if (initialReply) {
                      const toolCall = tryParseToolCall(initialReply);
                      if (toolCall) {
                        const toolResult = executeTool(toolCall.tool, toolCall.parameters);
                        const secondCallMessages = [
                          ...groqMessages,
                          { role: "assistant", content: initialReply },
                          { role: "system", content: toolResult },
                        ];

                        const secondRes = await callGroq(secondCallMessages);
                        if (secondRes.ok) {
                          const secondData = await secondRes.json();
                          const secondReply = secondData.choices?.[0]?.message?.content?.trim();
                          if (secondReply) {
                            res.statusCode = 200;
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify({ reply: secondReply }));
                            return;
                          }
                        }

                        // Fallback with tool result if second call failed
                        res.statusCode = 200;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ reply: toolResult }));
                        return;
                      }

                      res.statusCode = 200;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify({ reply: initialReply }));
                      return;
                    }
                  } else {
                    const errText = await groqRes.text().catch(() => "");
                    console.warn("[medinist-ai-dev] Upstream Groq returned error:", errText);
                  }
                } catch (fetchErr) {
                  console.warn("[medinist-ai-dev] Fetch to Groq failed:", fetchErr);
                }
              }

              // Fallback response if key is missing or upstream is slow
              const lastUserMessage = [...incomingMessages]
                .reverse()
                .find((m) => m.role === "user")?.content || "";

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  reply: `I understand your request regarding: "${lastUserMessage}". How can I help further with this?`,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: err?.message || "Internal server error",
                })
              );
            }
          });
          return;
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: {
      overlay: false,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    react(),
    medinistAiDevPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
