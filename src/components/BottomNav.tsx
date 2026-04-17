import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, ShoppingCart, MoreHorizontal, Sparkles } from "lucide-react";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, path: "/" },
  { label: "Sales", icon: ShoppingCart, path: "/sales" },
  { label: "AI", icon: Sparkles, path: "/ai" },
  { label: "More", icon: MoreHorizontal, path: "/more" },
];

const BottomNav = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { element } = useScrollContainer();
  const direction = useScrollDirection(element);
  const keyboardOpen = useKeyboardOpen();

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
      <div className="flex items-center justify-around py-2.5 px-2">
        {navItems.map(({ label, icon: Icon, path }) => {
          const isActive = pathname === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => {
                if (isActive) return;
                // Root-tab switches always replace, so the history stack
                // never accumulates tab-to-tab entries.
                navigate(path, { replace: true });
              }}
              className="flex flex-col items-center gap-0.5 flex-1 py-1"
            >
              <div className="p-1.5 rounded-xl transition-colors">
                <Icon
                  size={22}
                  className={`transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}
                />
              </div>
              <span className={`text-[10px] font-medium transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}>
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
