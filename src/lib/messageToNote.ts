import type { NoteBlock } from "@/hooks/useNotes";
import { parseCardPayload, type CardPayload } from "@/lib/chatCards";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LIST_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

/** Convert a card payload into a readable plain-text rendering for the note. */
export function cardToPlainText(card: CardPayload): string {
  if (card.kind === "medicine") {
    const d = card.data;
    return [
      `Medicine: ${d.name}`,
      `Generic: ${d.generic}`,
      `Shelf: ${d.shelf}`,
      `Stock: ${d.stock} ${d.unit}`,
      `Price: ${d.price}`,
    ].join("\n");
  }
  const d = card.data;
  return [
    `Invoice: ${d.invoiceNo}`,
    `Supplier: ${d.supplier}`,
    `Date: ${d.date}`,
    `Total: ${d.total}`,
    `Status: ${d.status}`,
  ].join("\n");
}

/** Return the plain-text payload of a message, expanding card sentinels. */
export function messagePlainText(content: string | null | undefined): string {
  if (!content) return "";
  const card = parseCardPayload(content);
  if (card) return cardToPlainText(card);
  return content;
}

/**
 * Parse plain message text into Note blocks. If the message contains bullet
 * or numbered list lines, those become a checklist block; surrounding prose
 * becomes text blocks. Otherwise a single text block is emitted.
 */
export function parseMessageToBlocks(text: string): NoteBlock[] {
  const raw = (text || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");

  const hasList = lines.some((l) => LIST_RE.test(l));
  if (!hasList) {
    const html = escapeHtml(raw).replace(/\n/g, "<br/>");
    return [{ id: newId(), type: "text", html }];
  }

  const blocks: NoteBlock[] = [];
  let textBuf: string[] = [];
  let checkItems: { id: string; text: string; checked: boolean }[] = [];

  const flushText = () => {
    const joined = textBuf.join("\n").trim();
    textBuf = [];
    if (!joined) return;
    blocks.push({
      id: newId(),
      type: "text",
      html: escapeHtml(joined).replace(/\n/g, "<br/>"),
    });
  };
  const flushCheck = () => {
    if (checkItems.length === 0) return;
    blocks.push({ id: newId(), type: "checklist", items: checkItems });
    checkItems = [];
  };

  for (const line of lines) {
    const m = line.match(LIST_RE);
    if (m) {
      flushText();
      checkItems.push({ id: newId(), text: m[1].trim(), checked: false });
    } else {
      flushCheck();
      textBuf.push(line);
    }
  }
  flushCheck();
  flushText();

  if (blocks.length === 0) {
    blocks.push({ id: newId(), type: "text", html: "" });
  }
  return blocks;
}