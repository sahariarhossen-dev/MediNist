import { createContext, useContext, type ReactNode } from "react";
import { useSubscriptionState, type SubscriptionState } from "@/hooks/useSubscription";

/**
 * Single source of truth for the subscription verdict. Previously every consumer
 * mounted its own copy of the hook, which meant duplicate fetches and copies
 * that could disagree during the post-login race.
 */
const FALLBACK: SubscriptionState = {
  sub: null,
  payments: [],
  loading: true,
  refetch: async () => {},
  pharmacyId: null,
  lastPopupShown: null,
  status: "unknown",
  resolution: "pending",
  isExpired: false,
  isTrial: false,
};

const SubscriptionContext = createContext<SubscriptionState>(FALLBACK);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const value = useSubscriptionState();
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => useContext(SubscriptionContext);
