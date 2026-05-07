import type { PaymentRecord, SubscriptionInfo } from "./subscriptionMock";

export type SubStatus = "trial" | "active" | "expired";

export function getStatus(
  sub: SubscriptionInfo | null,
  payments: PaymentRecord[],
): SubStatus {
  if (!sub) return "trial";
  const expiry = new Date(sub.expiry_date).getTime();
  const now = Date.now();
  const hasPaid = payments.some((p) => p.status === "success");
  if (expiry < now) return "expired";
  return hasPaid ? "active" : "trial";
}

export function isInTrial(
  sub: SubscriptionInfo | null,
  payments: PaymentRecord[],
): boolean {
  return getStatus(sub, payments) === "trial";
}