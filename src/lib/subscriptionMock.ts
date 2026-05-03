export type SubscriptionInfo = {
  plan: string;
  started_at: string;
  expiry_date: string;
  total_days: number;
};

export type PaymentRecord = {
  id: string;
  date: string;
  amount_bdt: number;
  duration_days: number;
  status: "success" | "pending";
};

export type ExtendPlan = {
  id: string;
  label: string;
  days: number;
  price_bdt: number;
  popular?: boolean;
  features: string[];
};

const now = new Date();
const expiry = new Date(now.getTime() + 21 * 86_400_000 + 12 * 3_600_000 + 25 * 60_000 + 30_000);
const started = new Date(now.getTime() - 9 * 86_400_000);

export const mockSubscription: SubscriptionInfo = {
  plan: "Pharmacy Pro",
  started_at: started.toISOString(),
  expiry_date: expiry.toISOString(),
  total_days: 30,
};

export const extendPlans: ExtendPlan[] = [
  {
    id: "1m",
    label: "1 Month",
    days: 30,
    price_bdt: 499,
    features: ["All Pro features", "Email support", "Daily backups"],
  },
  {
    id: "3m",
    label: "3 Months",
    days: 90,
    price_bdt: 1299,
    popular: true,
    features: ["Save 13%", "Priority support", "All Pro features"],
  },
  {
    id: "6m",
    label: "6 Months",
    days: 180,
    price_bdt: 2399,
    features: ["Save 20%", "Priority support", "Free onboarding"],
  },
];

export const mockPayments: PaymentRecord[] = [
  {
    id: "p1",
    date: new Date(now.getTime() - 9 * 86_400_000).toISOString(),
    amount_bdt: 499,
    duration_days: 30,
    status: "success",
  },
  {
    id: "p2",
    date: new Date(now.getTime() - 70 * 86_400_000).toISOString(),
    amount_bdt: 1299,
    duration_days: 90,
    status: "success",
  },
  {
    id: "p3",
    date: new Date(now.getTime() - 1 * 86_400_000).toISOString(),
    amount_bdt: 499,
    duration_days: 30,
    status: "pending",
  },
];

export function stackExpiry(current: Date, addDays: number): Date {
  const base = current.getTime() > Date.now() ? current : new Date();
  return new Date(base.getTime() + addDays * 86_400_000);
}

export function formatBDT(amount: number): string {
  return `৳${amount.toLocaleString("en-IN")}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}