import BottomNav from "./BottomNav";
import AppHeader from "./AppHeader";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useRootBackHandler } from "@/hooks/useRootBackHandler";
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionExpiredOverlay from "./subscription/SubscriptionExpiredOverlay";
import { useLocation } from "react-router-dom";
import DemoBanner from "./DemoBanner";
import ShiftTracker from "./staff/ShiftTracker";
import ReadOnlyBanner from "./ReadOnlyBanner";
import { useAuth } from "@/contexts/AuthContext";


const AppLayout = ({ children, showHeader = true }: { children: React.ReactNode; showHeader?: boolean }) => {
  useRootBackHandler();
  const { isExpired, loading: subLoading, resolution } = useSubscription();
  const { isDemo } = useAuth();
  const { pathname } = useLocation();
  const allowDuringExpiry = pathname.startsWith("/subscription");
  return (
    <ScrollContainerProvider>
      <DemoBanner />
      <ReadOnlyBanner />
      {showHeader && <AppHeader />}
      {children}
      <BottomNav />
      <ShiftTracker />
      {/* Lock only on a settled, server-confirmed expiry — never on a pending/unresolved read. */}
      {!subLoading && resolution === "resolved" && isExpired && !allowDuringExpiry && !isDemo && (
        <SubscriptionExpiredOverlay />
      )}


    </ScrollContainerProvider>
  );
};

export default AppLayout;
