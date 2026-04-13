export type Msg = { role: "user" | "assistant"; content: string };

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  messages: Msg[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "medinistai_conversations";

const DUMMY_CONVERSATIONS: Conversation[] = [
  {
    id: "demo-1",
    title: "Inventory Report - Square Pharma",
    preview: "Showing items less than 20 boxes in stock from Square Pharmaceuticals...",
    messages: [
      { role: "assistant", content: "Hello! How can I help you manage Naseer Medical Hall today?" },
      { role: "user", content: "Show me low stock items from Square Pharma" },
      { role: "assistant", content: "Here are the items with less than 20 boxes in stock from Square Pharmaceuticals:\n\n1. **Napa Extra** - 8 boxes\n2. **Seclo 20mg** - 12 boxes\n3. **Azith 500mg** - 5 boxes" },
    ],
    pinned: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: "demo-2",
    title: "Today's Sales Summary",
    preview: "Total sales today: ৳12,450. Top selling: Napa Extra (45 strips)...",
    messages: [
      { role: "assistant", content: "Hello! How can I help you manage Naseer Medical Hall today?" },
      { role: "user", content: "What is today's total sale?" },
      { role: "assistant", content: "Today's total sales: **৳12,450**\n\nTop selling items:\n- Napa Extra: 45 strips\n- Seclo 20mg: 30 strips\n- Montas 10: 22 strips" },
    ],
    pinned: false,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 1800000,
  },
  {
    id: "demo-3",
    title: "Expiry Alert - March 2026",
    preview: "3 medicines expiring within 30 days. Immediate action needed...",
    messages: [
      { role: "assistant", content: "Hello! How can I help you manage Naseer Medical Hall today?" },
      { role: "user", content: "Any medicines expiring soon?" },
      { role: "assistant", content: "⚠️ **3 medicines expiring within 30 days:**\n\n1. Amoxil 250mg - Expires: Apr 15, 2026\n2. Losectil 20mg - Expires: Apr 20, 2026\n3. Sergel 20mg - Expires: Apr 28, 2026" },
    ],
    pinned: true,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 7200000,
  },
  {
    id: "demo-4",
    title: "Medicine Suggestion - Fever",
    preview: "Recommended alternatives for fever: Napa, Ace, Fast...",
    messages: [
      { role: "assistant", content: "Hello! How can I help you manage Naseer Medical Hall today?" },
      { role: "user", content: "Suggest medicines for fever" },
      { role: "assistant", content: "Here are some available fever medicines:\n\n💊 **Paracetamol-based:**\n- Napa 500mg (Beximco)\n- Ace 500mg (Square)\n- Fast 500mg (ACI)\n\n💊 **Combination:**\n- Napa Extra (Para + Caffeine)\n- Ace Plus" },
    ],
    pinned: false,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 2,
  },
];

export const DEFAULT_FIRST_MESSAGE: Msg = {
  role: "assistant",
  content:
    "Hello! How can I help you manage Naseer Medical Hall today?\n\nI can assist with:\n- 📦 Inventory queries\n- 💰 Sales reports\n- 💊 Medicine suggestions\n- ⚠️ Expiry alerts",
};

export function getConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  // Seed dummy data
  saveConversations(DUMMY_CONVERSATIONS);
  return DUMMY_CONVERSATIONS;
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch { /* ignore */ }
}

export function createConversation(): Conversation {
  const convos = getConversations();
  const newConvo: Conversation = {
    id: crypto.randomUUID(),
    title: "New Chat",
    preview: "",
    messages: [DEFAULT_FIRST_MESSAGE],
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  convos.unshift(newConvo);
  saveConversations(convos);
  return newConvo;
}

export function deleteConversation(id: string) {
  const convos = getConversations().filter((c) => c.id !== id);
  saveConversations(convos);
}

export function deleteMultiple(ids: string[]) {
  const set = new Set(ids);
  const convos = getConversations().filter((c) => !set.has(c.id));
  saveConversations(convos);
}

export function togglePin(id: string) {
  const convos = getConversations().map((c) =>
    c.id === id ? { ...c, pinned: !c.pinned } : c
  );
  saveConversations(convos);
}

export function pinMultiple(ids: string[]) {
  const set = new Set(ids);
  const convos = getConversations().map((c) =>
    set.has(c.id) ? { ...c, pinned: true } : c
  );
  saveConversations(convos);
}

export function updateMessages(id: string, messages: Msg[]) {
  const convos = getConversations().map((c) => {
    if (c.id !== id) return c;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return {
      ...c,
      messages,
      preview: (lastAssistant?.content || "").slice(0, 100),
      title: lastUser ? lastUser.content.slice(0, 40) : c.title,
      updatedAt: Date.now(),
    };
  });
  saveConversations(convos);
}

export function getConversation(id: string): Conversation | undefined {
  return getConversations().find((c) => c.id === id);
}
