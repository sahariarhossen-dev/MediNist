import BottomNav from "./BottomNav";

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <>
    {children}
    <BottomNav />
  </>
);

export default AppLayout;
