import BottomNav from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useRootBackHandler } from "@/hooks/useRootBackHandler";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionExpiredOverlay from "./subscription/SubscriptionExpiredOverlay";
import { useLocation } from "react-router-dom";
import DemoBanner from "./DemoBanner";
import ShiftTracker from "./staff/ShiftTracker";
import ReadOnlyBanner from "./ReadOnlyBanner";
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
      <ReadOnlyBanner />
      {children}
      <BottomNav />
      <ShiftTracker />
      {isExpired && !allowDuringExpiry && !isDemo && <SubscriptionExpiredOverlay />}


    </ScrollContainerProvider>
  );
};

export default AppLayout;
