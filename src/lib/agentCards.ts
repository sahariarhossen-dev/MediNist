/**
 * Agentic card protocol for AI Assistant messages.
 *
 * Backward compatible: messages without an agent block render exactly as before.
 * A message MAY carry a machine block anywhere in its content:
 *
 *   [[agent:v1]]{"cards":[...],"actions":[...],"suggestions":[...]}
 *
 * In addition, raw JSON that leaks into the prose (fenced ```json blocks) is
 * lifted out and rendered as a clean key/value card instead of a raw string.
 */

export type AgentActionId =
  | "check_stock"
  | "reorder"
  | "assign_task"
  | "forward_to_staff";

export interface AgentAction {
  id: AgentActionId;
  label: string;
}

export interface KeyValueRow {
  label: string;
  value: string;
}

export type AgentCard =
  | { kind: "summary"; title: string; subtitle?: string; rows: KeyValueRow[] }
  | {
      kind: "list";
      title: string;
      subtitle?: string;
      items: { name: string; meta?: string; value?: string }[];
    };

export interface AgentBlock {
  cards: AgentCard[];
  actions: AgentAction[];
  suggestions?: string[];
}

const SENTINEL = "[[agent:v1]]";

export const ACTION_LABELS: Record<AgentActionId, string> = {
  check_stock: "Check Stock",
  reorder: "Re-order",
  assign_task: "Assign Task to Staff",
  forward_to_staff: "Forward to Staff",
};

export function buildAgentBlock(block: AgentBlock): string {
  return `\n${SENTINEL}${JSON.stringify(block)}`;
}

const isCard = (c: unknown): c is AgentCard => {
  if (!c || typeof c !== "object") return false;
  const k = (c as { kind?: string }).kind;
  if (k === "summary") return Array.isArray((c as { rows?: unknown }).rows);
  if (k === "list") return Array.isArray((c as { items?: unknown }).items);
  return false;
};

/** Split content into visible prose + parsed agent block (if any). */
export function parseAgentMessage(content: string): {
  prose: string;
  block: AgentBlock | null;
  jsonCards: AgentCard[];
} {
  let prose = content ?? "";
  let block: AgentBlock | null = null;

  const idx = prose.indexOf(SENTINEL);
  if (idx >= 0) {
    const rest = prose.slice(idx + SENTINEL.length);
    const newline = rest.indexOf("\n");
    const jsonPart = newline === -1 ? rest : rest.slice(0, newline);
    const tail = newline === -1 ? "" : rest.slice(newline);
    try {
      const parsed = JSON.parse(jsonPart) as Partial<AgentBlock>;
      block = {
        cards: Array.isArray(parsed.cards) ? parsed.cards.filter(isCard) : [],
        actions: Array.isArray(parsed.actions)
          ? parsed.actions.filter(
              (a): a is AgentAction =>
                !!a && typeof a === "object" && typeof (a as AgentAction).id === "string"
            )
          : [],
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s) => typeof s === "string")
          : [],
      };
      prose = (prose.slice(0, idx) + tail).trim();
    } catch {
      // Malformed block: leave the content untouched rather than losing text.
      block = null;
    }
  }

  const { text, cards } = liftJsonBlocks(prose);
  return { prose: text, block, jsonCards: cards };
}

/** Turn fenced ```json ...``` payloads in the prose into readable cards. */
function liftJsonBlocks(text: string): { text: string; cards: AgentCard[] } {
  const cards: AgentCard[] = [];
  const cleaned = text.replace(/```(?:json)\s*([\s\S]*?)```/gi, (_m, body: string) => {
    const card = jsonToCard(body);
    if (!card) return _m;
    cards.push(card);
    return "";
  });
  return { text: cleaned.trim(), cards };
}

const prettyLabel = (k: string) =>
  k
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const scalar = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return new Intl.NumberFormat("en-US").format(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
};

function jsonToCard(raw: string): AgentCard | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (Array.isArray(data)) {
    const items = data.slice(0, 25).map((row) => {
      if (row && typeof row === "object") {
        const obj = row as Record<string, unknown>;
        const nameKey =
          Object.keys(obj).find((k) => /name|title|medicine|product|customer|staff/i.test(k)) ??
          Object.keys(obj)[0];
        const valueKey = Object.keys(obj).find((k) =>
          /qty|quantity|stock|total|amount|price|count/i.test(k)
        );
        const metaKeys = Object.keys(obj).filter((k) => k !== nameKey && k !== valueKey).slice(0, 2);
        return {
          name: scalar(obj[nameKey]),
          meta: metaKeys.map((k) => `${prettyLabel(k)}: ${scalar(obj[k])}`).join(" · ") || undefined,
          value: valueKey ? scalar(obj[valueKey]) : undefined,
        };
      }
      return { name: scalar(row) };
    });
    if (items.length === 0) return null;
    return { kind: "list", title: "Details", items };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const rows = Object.entries(obj)
      .filter(([, v]) => typeof v !== "object" || v === null)
      .slice(0, 12)
      .map(([k, v]) => ({ label: prettyLabel(k), value: scalar(v) }));
    if (rows.length === 0) return null;
    return { kind: "summary", title: "Details", rows };
  }
  return null;
}

/**
 * Derive inline actions for an assistant reply from the conversation intent.
 * Used when the reply carries no explicit agent block.
 */
export function deriveActions(question: string, reply: string): AgentAction[] {
  const q = `${question} ${reply}`.toLowerCase();
  const actions: AgentAction[] = [];
  const add = (id: AgentActionId) => {
    if (!actions.some((a) => a.id === id)) actions.push({ id, label: ACTION_LABELS[id] });
  };

  const stocky = /stock|kom|short|shortage|expire|expiry|inventory|medicine|reorder|re-order|ঔষধ|স্টক/.test(q);
  const salesy = /sale|sales|bikri|বিক্রি|revenue|profit|due|বাকি|report|performance/.test(q);

  if (stocky) {
    add("check_stock");
    add("reorder");
  }
  if (stocky || salesy) {
    add("assign_task");
    add("forward_to_staff");
  }
  return actions;
}

/**
 * Follow-up prompt chips for an assistant reply that carries no explicit
 * `suggestions[]` in its agent block.
 */
export function deriveSuggestions(question: string, reply: string): string[] {
  const q = `${question} ${reply}`.toLowerCase();
  const out: string[] = [];
  const add = (s: string) => {
    if (out.length < 3 && !out.includes(s)) out.push(s);
  };

  const salesy = /sale|sales|bikri|বিক্রি|revenue|profit|report|performance/.test(q);
  const stocky = /stock|kom|short|shortage|inventory|medicine|reorder|re-order|স্টক|ঔষধ/.test(q);
  const expiry = /expire|expiry|expiring/.test(q);
  const dues = /due|baki|বাকি|customer|ledger|payment/.test(q);

  if (salesy) {
    add("Compare with yesterday");
    add("Top selling medicine?");
  }
  if (stocky) {
    add("Which items to re-order?");
    add("Show low stock list");
  }
  if (expiry) add("Expiring in 30 days?");
  if (dues) add("Who owes the most?");
  if (out.length === 0) {
    add("আজকের বিক্রি কত?");
    add("Stock kom ase kon medicine gulor?");
  }
  return out;
}

/** Plain-text version of an assistant reply, safe to forward into staff chat. */
export function forwardableText(content: string): string {
  const { prose } = parseAgentMessage(content);
  return prose.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
}
