import {
  TrendingUp,
  PackageSearch,
  Trophy,
  CalendarClock,
  Wallet,
  Receipt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface SlashCommand {
  cmd: string;
  label: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  ownerOrManagerOnly?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: "/sales",
    label: "আজকের বিক্রয় (Today's Sales)",
    description: "মোট বিক্রি, ক্যাশ ও অনলাইন পেমেন্ট কালেকশন",
    prompt: "/sales",
    icon: TrendingUp,
  },
  {
    cmd: "/stock",
    label: "কম স্টক ওষুধ (Low Stock)",
    description: "রি-অর্ডারের জন্য ঘাটতি ওষুধের জরুরি তালিকা",
    prompt: "/stock",
    icon: PackageSearch,
  },
  {
    cmd: "/expiry",
    label: "মেয়াদ শেষের তালিকা (Expiring Soon)",
    description: "আগামী ৯০ দিনের মধ্যে মেয়াদোত্তীর্ণ ওষুধ",
    prompt: "/expiry",
    icon: CalendarClock,
  },
  {
    cmd: "/dues",
    label: "কাস্টমার বকেয়া (Customer Dues)",
    description: "বাকি থাকা কাস্টমারদের নাম ও টাকার পরিমাণ",
    prompt: "/dues",
    icon: Wallet,
    ownerOrManagerOnly: true,
  },
  {
    cmd: "/staff",
    label: "স্টাফ পারফরম্যান্স (Staff Sales)",
    description: "কর্মীদের বিক্রয় ও ট্রানজ্যাকশন রিপোর্ট",
    prompt: "/staff",
    icon: Trophy,
    ownerOrManagerOnly: true,
  },
  {
    cmd: "/expenses",
    label: "আজকের খরচ (Expenses)",
    description: "ক্যাশ আউটফ্লো ও ক্যাটাগরিভিত্তিক খরচের তালিকা",
    prompt: "/expenses",
    icon: Receipt,
    ownerOrManagerOnly: true,
  },
  {
    cmd: "/start",
    label: "বট কমান্ড মেনু (Bot Help)",
    description: "টেলিগ্রাম-স্টাইল বট কমান্ড ও শর্টকাট ওভারভিউ",
    prompt: "/start",
    icon: Sparkles,
  },
];
