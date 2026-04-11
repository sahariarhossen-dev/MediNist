import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Package, Settings, ChevronRight, Store } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const menuItems = [
  { label: "Add Inventory", icon: Package, path: "/inventory", color: "text-blue-600" },
  { label: "Shop Profile", icon: Store, path: "/shop-profile", color: "text-teal-600" },
  { label: "Settings", icon: Settings, path: null, color: "text-gray-500" },
];

const More = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <span className="text-xl font-bold text-blue-600 tracking-tight">Medinist</span>
        <Avatar className="h-9 w-9 cursor-pointer" onClick={() => navigate("/shop-profile")}>
          {profile?.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt="Avatar" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-blue-500 text-white text-sm font-semibold">
            {getInitials(profile?.full_name ?? null)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Profile Card */}
      <div
        className="mx-5 mt-2 bg-white rounded-2xl p-4 shadow-sm cursor-pointer"
        onClick={() => navigate("/shop-profile")}
      >
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-blue-100">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="Avatar" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-blue-500 text-white text-lg font-bold">
              {getInitials(profile?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 text-base truncate">{profile?.full_name || "User"}</p>
            <p className="text-sm text-gray-500 truncate">{profile?.phone || "—"}</p>
            <p className="text-xs text-gray-400 truncate mt-0.5">{pharmacyName || "Your Pharmacy"}</p>
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-5 pt-5 space-y-2">
        {menuItems.map(({ label, icon: Icon, path, color }) => (
          <button
            key={label}
            onClick={() => path && navigate(path)}
            className="w-full flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm text-left"
          >
            <Icon size={20} className={color} />
            <span className="flex-1 font-medium text-gray-800 text-sm">{label}</span>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default More;
