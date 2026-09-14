export type FilterTabId = "all" | "unread" | "ai" | "shop";

export interface ChatItem {
  id: string;
  type: "ai" | "staff";
  title: string;
  subtitle: string;
  timestamp: string;
  unreadCount?: number;
  initials?: string;
  category: "ai" | "shop";
}

export const MOCK_CHATS: ChatItem[] = [
  {
    id: "ai-1",
    type: "ai",
    title: "আজকের বিক্রি কত?",
    subtitle: "আজকের মোট বিক্রি ৳১৪,৫২০। ক্যাশ বিক্রি ৳১০,২০০, বাকি ৳৪,৩২০। মোট ৪২টি ইনভয়েস সম্পন্ন হয়েছে।",
    timestamp: "2d ago",
    unreadCount: 1,
    category: "ai",
  },
  {
    id: "staff-1",
    type: "staff",
    title: "Salman F",
    initials: "SF",
    subtitle: "hlw salman, did you check the delivery from Incepta?",
    timestamp: "1w ago",
    category: "shop",
  },
  {
    id: "ai-2",
    type: "ai",
    title: "Stock kom ase kon medicine gulor?",
    subtitle: "বর্তমানে ৪টি ওষুধের স্টক সতর্কতা লেভেলের নিচে আছে: Alanil, Napa Extra, Seclo 20mg ও Sergel 20mg।",
    timestamp: "3h ago",
    unreadCount: 2,
    category: "ai",
  },
  {
    id: "staff-2",
    type: "staff",
    title: "Pharmacy staff",
    initials: "PS",
    subtitle: "Re-order request 1. Alanil Tablet 50 strips 2. Napa Rapid 100 strips 3. Ace Plus 40 strips.",
    timestamp: "1w ago",
    category: "shop",
  },
  {
    id: "ai-3",
    type: "ai",
    title: "Expiring medicines this month",
    subtitle: "There are 3 batches of Ciprocin 500mg and 2 batches of Azithromycin expiring within 30 days.",
    timestamp: "4d ago",
    unreadCount: 1,
    category: "ai",
  },
  {
    id: "staff-3",
    type: "staff",
    title: "Tanvir Rahman",
    initials: "TR",
    subtitle: "Evening shift cash register reconciled. Handed over drawer to night shift.",
    timestamp: "5h ago",
    category: "shop",
  },
  {
    id: "staff-4",
    type: "staff",
    title: "Night Shift Team",
    initials: "NS",
    subtitle: "Customer prescription pending for home delivery at 9:30 PM tonight.",
    timestamp: "2d ago",
    category: "shop",
  },
  {
    id: "ai-4",
    type: "ai",
    title: "Top selling antibiotics this week",
    subtitle: "Top 3: 1. Cef-3 200mg (84 strips), 2. Moxaclav 625mg (62 strips), 3. Zithrin 500mg (55 strips).",
    timestamp: "5d ago",
    category: "ai",
  },
];

export interface FilterTab {
  id: FilterTabId;
  label: string;
  badge?: number;
}

export const FILTER_TABS: FilterTab[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread", badge: 3 },
  { id: "ai", label: "MediNist AI" },
  { id: "shop", label: "Shop Messages" },
];
