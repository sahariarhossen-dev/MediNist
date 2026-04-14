import BottomNav from "./BottomNav";
import FloatingChatBubble from "./ai/FloatingChatBubble";

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <>
    {children}
    <BottomNav />
    <FloatingChatBubble />
  </>
);

export default AppLayout;
