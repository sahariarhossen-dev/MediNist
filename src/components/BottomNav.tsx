import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, ShoppingCart, Truck, MoreHorizontal, MessagesSquare } from "lucide-react";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";

const BottomNav = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { element } = useScrollContainer();
  const direction = useScrollDirection(element);
  const keyboardOpen = useKeyboardOpen();
  const { activeLocation, isWarehouse: ctxIsWarehouse } = useLocationStore();

  const isWarehouse =
    ctxIsWarehouse ??
    (activeLocation?.type === "warehouse" || (activeLocation?.type as string) === "godown");

  const navItems = [
    { label: "Dashboard", icon: LayoutGrid, path: "/dashboard" },
    {
      label: isWarehouse ? "Movements" : "Sales",
      icon: isWarehouse ? Truck : ShoppingCart,
      path: isWarehouse ? "/stock-movements" : "/sales",
    },
    { label: "Chats", icon: MessagesSquare, path: "/workspace" },
    { label: "More", icon: MoreHorizontal, path: "/more" },
  ];

  const hidden = keyboardOpen || direction === "down";

  return (
    <nav
      aria-hidden={hidden}
      className={cn(
        "fixed bottom-4 left-4 right-4 max-w-md mx-auto bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] z-50",
        "transition-all duration-300 ease-out will-change-transform",
        hidden ? "translate-y-[150%] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around py-2.5 px-1">
        {navItems.map(({ label, icon: Icon, path }) => {
          const isActive = pathname === path || pathname.startsWith(path + "/");
          return (
            <button
              key={path}
              type="button"
              onClick={() => {
                if (isActive) return;
                navigate(path, { replace: true });
              }}
              className="flex flex-col items-center gap-0.5 flex-1 py-1"
            >
              <div className="p-1.5 rounded-xl transition-colors">
                <Icon
                  size={22}
                  className={`transition-colors ${isActive ? "text-blue-600" : "text-muted-foreground"}`}
                />
              </div>
              <span className={`text-fluid-xs font-medium transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
