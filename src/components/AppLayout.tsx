import BottomNav from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useRootBackHandler } from "@/hooks/useRootBackHandler";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  useRootBackHandler();
  return (
    <ScrollContainerProvider>
      {children}
      <BottomNav />
    </ScrollContainerProvider>
  );
};

export default AppLayout;
