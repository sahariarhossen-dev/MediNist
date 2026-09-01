/**
 * Topic registry for the multi-threaded AI co-pilot.
 *
 * Each AI thread is created around a topic. The topic drives:
 *  - the greeting shown before the first turn
 *  - the quick-action prompt chips
 *  - which slash commands are surfaced first
 *  - the dynamic canvas mode
 *  - a short focus directive appended to the server system prompt
 *
 * `topic_key` is persisted on `ai_conversations`; everything else is derived
 * client-side so no extra storage is needed.
 */
import {
  TrendingUp,
  PackageSearch,
  CalendarClock,
  Trophy,
  Wallet,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

export type TopicKey = "sales" | "stock" | "expiry" | "staff" | "dues" | "general";

export type CanvasMode = "chart" | "medicines" | "staff" | "ledger" | "none";

export interface TopicDef {
  key: TopicKey;
  label: string;
  /** Suggested thread title when the user picks the preset. */
  suggestedTitle: string;
  icon: LucideIcon;
  /** Tailwind classes for the avatar gradient. */
  accent: string;
  greeting: string;
  quickPrompts: string[];
  canvas: CanvasMode;
  /** Slash commands surfaced first inside this topic. */
  commands: string[];
}

export const TOPICS: TopicDef[] = [
  {
    key: "sales",
    label: "Sales Analysis",
    suggestedTitle: "Sales Analysis",
    icon: TrendingUp,
    accent: "from-indigo-500 to-sky-500",
    greeting:
      "**Sales Analysis** thread ready. Ei thread e ami shudhu apnar bikri, revenue, trend ar target niye kotha bolbo.",
    quickPrompts: [
      "আজকের বিক্রি কত?",
      "Ei mash er sales trend dekhao",
      "Top selling medicines this month",
      "Kal er sathe ajker compare koro",
    ],
    canvas: "chart",
    commands: ["/sales", "/staff-performance"],
  },
  {
    key: "stock",
    label: "Stock & Reorder",
    suggestedTitle: "Stock & Reorder",
    icon: PackageSearch,
    accent: "from-emerald-500 to-teal-500",
    greeting:
      "**Stock & Reorder** thread ready. Stock level, short item ar re-order list — sob ekhane.",
    quickPrompts: [
      "Kon medicine gulor stock kom ase?",
      "Short item list দাও",
      "Re-order korar jonno priority list দাও",
      "Total stock value koto?",
    ],
    canvas: "medicines",
    commands: ["/stock", "/short-items"],
  },
  {
    key: "expiry",
    label: "Expiring Medicines",
    suggestedTitle: "Expiring Medicines",
    icon: CalendarClock,
    accent: "from-amber-500 to-orange-500",
    greeting:
      "**Expiring Medicines** thread ready. Expiry date, loss risk ar return planning niye জিজ্ঞেস করুন.",
    quickPrompts: [
      "Expire howar age ki ki ase?",
      "30 diner moddhe kon gulo expire hobe?",
      "Expiry loss koto takar?",
      "Kon company ke return dite hobe?",
    ],
    canvas: "medicines",
    commands: ["/expiry", "/stock"],
  },
  {
    key: "staff",
    label: "Staff Performance",
    suggestedTitle: "Staff Performance",
    icon: Trophy,
    accent: "from-violet-500 to-fuchsia-500",
    greeting:
      "**Staff Performance** thread ready. Staff der sales, target ar duty niye analysis chaite paren.",
    quickPrompts: [
      "Ei mash e staff der performance kemon?",
      "Best performer ke?",
      "Target theke kara pichiye ase?",
      "Aj ke ke duty te ase?",
    ],
    canvas: "staff",
    commands: ["/staff-performance", "/sales"],
  },
  {
    key: "dues",
    label: "Customer Dues",
    suggestedTitle: "Customer Dues",
    icon: Wallet,
    accent: "from-rose-500 to-red-500",
    greeting:
      "**Customer Dues** thread ready. Baki, ledger ar collection niye focus kore uttor dibo.",
    quickPrompts: [
      "Total customer due koto?",
      "Top due customer der list dao",
      "Ei shopta he koto collection hoyeche?",
      "Kar due shob theke purono?",
    ],
    canvas: "ledger",
    commands: ["/dues"],
  },
  {
    key: "general",
    label: "General",
    suggestedTitle: "General Chat",
    icon: MessageCircle,
    accent: "from-slate-500 to-slate-700",
    greeting:
      "**Assalamu Alaikum!** Ami apnar **MediNist AI co-pilot**. Ei thread e je kono prosno korte paren — Bengali, Banglish ba English.",
    quickPrompts: [
      "MediNist e ki ki feature ase?",
      "আজকের বিক্রি কত?",
      "Stock kom ase kon medicine gulor?",
      "Paracetamol er dose koto?",
    ],
    canvas: "none",
    commands: ["/sales", "/stock", "/dues"],
  },
];

export const GENERAL_TOPIC = TOPICS[TOPICS.length - 1];

export const getTopic = (key?: string | null): TopicDef =>
  TOPICS.find((t) => t.key === key) ?? GENERAL_TOPIC;

/** Short directive appended to the server system prompt for this topic. */
export const topicFocus = (key?: string | null): string => {
  const t = getTopic(key);
  if (t.key === "general") return "";
  return `The user opened this thread specifically for "${t.label}". Keep answers focused on that subject, and if they ask about something clearly unrelated, answer briefly and suggest opening a dedicated topic thread for it.`;
};
