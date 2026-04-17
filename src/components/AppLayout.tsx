import BottomNav from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <ScrollContainerProvider>
    {children}
    <BottomNav />
  </ScrollContainerProvider>
);

export default AppLayout;
