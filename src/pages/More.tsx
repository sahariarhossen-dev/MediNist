import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Package, Settings, ChevronRight, Store, LogOut, HelpCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const menuItems = [
  { label: "Add Inventory", icon: Package, path: "/inventory", color: "bg-blue-100 text-blue-600" },
  { label: "Shop Profile", icon: Store, path: "/shop-profile", color: "bg-emerald-100 text-emerald-600" },
  { label: "Settings", icon: Settings, path: null, color: "bg-gray-100 text-gray-600" },
  { label: "Help & Support", icon: HelpCircle, path: null, color: "bg-amber-100 text-amber-600" },
];

const More = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName, signOut } = useAuth();

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Gradient Profile Header */}
      <div
        className="bg-gradient-to-r from-blue-600 to-indigo-700 px-5 pt-10 pb-8 rounded-b-3xl cursor-pointer"
        onClick={() => navigate("/shop-profile")}
      >
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-[3px] border-white/80 shadow-lg">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="Avatar" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
              {getInitials(profile?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white text-lg truncate">{profile?.full_name || "User"}</p>
            <p className="text-sm text-white/70 truncate">{profile?.phone || "—"}</p>
            <p className="text-xs text-white/60 truncate mt-0.5">{pharmacyName || "Your Pharmacy"}</p>
          </div>
          <ChevronRight size={20} className="text-white/60 flex-shrink-0" />
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 pt-6 space-y-2">
        {menuItems.map(({ label, icon: Icon, path, color }) => (
          <button
            key={label}
            onClick={() => path && navigate(path)}
            className="w-full flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={20} />
            </div>
            <span className="flex-1 font-medium text-gray-800">{label}</span>
            <ChevronRight size={18} className="text-gray-400" />
          </button>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left mt-4"
        >
          <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-100 text-red-600">
            <LogOut size={20} />
          </div>
          <span className="flex-1 font-medium text-red-600">Log Out</span>
          <ChevronRight size={18} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
};

export default More;
