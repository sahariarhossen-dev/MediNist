import type { PaymentRecord, SubscriptionInfo } from "./subscriptionMock";

/**
 * "unknown" means the client could not confirm the subscription yet (query still
 * in flight, empty result, or an error). It must never be treated as expired —
 * that is what caused the false lockout right after login.
 */
export type SubStatus = "unknown" | "trial" | "active" | "expired";

export function getStatus(
  sub: SubscriptionInfo | null,
  payments: PaymentRecord[],
): SubStatus {
  if (!sub) return "unknown";
  const expiry = new Date(sub.expiry_date).getTime();
  if (!Number.isFinite(expiry)) return "unknown";
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
