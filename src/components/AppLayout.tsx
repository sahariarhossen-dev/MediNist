import BottomNav from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useRootBackHandler } from "@/hooks/useRootBackHandler";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionExpiredOverlay from "./subscription/SubscriptionExpiredOverlay";
import { useLocation } from "react-router-dom";
import DemoBanner from "./DemoBanner";
import SecurityGate from "./security/SecurityGate";
import { useAuth } from "@/contexts/AuthContext";


const AppLayout = ({ children }: { children: React.ReactNode }) => {
  useRootBackHandler();
  const { isExpired } = useSubscription();
  const { isDemo } = useAuth();
  const { pathname } = useLocation();
  const allowDuringExpiry = pathname.startsWith("/subscription");
  return (
    <ScrollContainerProvider>
      <DemoBanner />
      {children}
      <BottomNav />
      <SecurityGate />
      {isExpired && !allowDuringExpiry && !isDemo && <SubscriptionExpiredOverlay />}

    </ScrollContainerProvider>
  );
};

export default AppLayout;
