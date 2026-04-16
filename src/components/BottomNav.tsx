import { useLocation, Link } from "react-router-dom";
import { LayoutGrid, ShoppingCart, MoreHorizontal, Sparkles } from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, path: "/" },
  { label: "Sales", icon: ShoppingCart, path: "/sales" },
  { label: "AI", icon: Sparkles, path: "/ai" },
  { label: "More", icon: MoreHorizontal, path: "/more" },
];

const BottomNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-4 left-4 right-4 max-w-md mx-auto bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] z-50">
      <div className="flex items-center justify-around py-2.5 px-2">
        {navItems.map(({ label, icon: Icon, path }) => {
          const isActive = pathname === path;
          

          return (
            <Link
              key={path}
              to={path}
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
