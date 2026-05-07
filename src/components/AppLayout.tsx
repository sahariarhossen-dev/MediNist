import BottomNav from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useRootBackHandler } from "@/hooks/useRootBackHandler";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionExpiredOverlay from "./subscription/SubscriptionExpiredOverlay";
import { useLocation } from "react-router-dom";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  useRootBackHandler();
  const { isExpired } = useSubscription();
  const { pathname } = useLocation();
  const allowDuringExpiry = pathname.startsWith("/subscription");
  return (
    <ScrollContainerProvider>
      {children}
      <BottomNav />
      {isExpired && !allowDuringExpiry && <SubscriptionExpiredOverlay />}
    </ScrollContainerProvider>
  );
};

export default AppLayout;
