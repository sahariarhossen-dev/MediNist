// Shared helpers for the ai-chat edge function.
// Kept in a separate module so contextBuilder.ts can be imported by tests
// without pulling in Deno.serve / HTTP code from index.ts.

export type Role = "owner" | "manager" | "salesman";

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

export function fallbackContextMessage(reason: string): string {
  return [
    "LIVE PHARMACY DATA: unavailable for this request.",
    `Reason: ${reason}`,
    "If the user asks for exact live numbers, explain that live data could not be loaded and provide general pharmacy guidance instead.",
  ].join("\n");
}

export function safeField(value: unknown, max = 100): string {
  if (value === null || value === undefined) return "—";
  const s = String(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}