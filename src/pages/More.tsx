import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Package, Settings, ChevronRight, Store, Wallet, Users, StickyNote, Activity, LockKeyhole } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AppHeader from "@/components/AppHeader";

const allMenuItems = [
  { label: "Add Inventory", icon: Package, path: "/inventory", color: "text-blue-600" },
  { label: "Customers", icon: Users, path: "/more/customers", color: "text-purple-600" },
  { label: "Smart Notepad", icon: StickyNote, path: "/more/notes", color: "text-[#2563eb]" },
  { label: "Daily Transactions", icon: Wallet, path: "/more/daily-transactions", color: "text-teal-600" },
  { label: "Staff Activity", icon: Activity, path: "/more/staff-activity", color: "text-rose-600" },
  { label: "Shift End / Cash Closing", icon: LockKeyhole, path: "/more/cash-closing", color: "text-indigo-600" },
  { label: "Shop Profile", icon: Store, path: "/shop-profile", color: "text-teal-600" },
  { label: "Settings", icon: Settings, path: null, color: "text-gray-500" },
];

const More = () => {
  const navigate = useNavigate();
  const { user, profile, pharmacyName } = useAuth();
  const [pharmacyLogo, setPharmacyLogo] = useState<string | null>(null);

  useEffect(() => {
    const fetchPharmacyLogo = async () => {
      if (!profile?.pharmacy_id) return;
      const { data } = await supabase
        .from("pharmacies")
        .select("logo_url")
        .eq("id", profile.pharmacy_id)
        .single();
      setPharmacyLogo(data?.logo_url ?? null);
    };
    fetchPharmacyLogo();
    window.addEventListener("focus", fetchPharmacyLogo);
    return () => window.removeEventListener("focus", fetchPharmacyLogo);
  }, [profile?.pharmacy_id]);

  const getUserInitials = (name: string | null) =>
    name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const getShopInitials = (name: string | null) =>
    name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "S";

  const contactInfo = user?.email || profile?.phone || "—";

  const menuItems = allMenuItems.filter((item) => {
    if (profile?.role === "salesman" && item.path === "/more/daily-transactions") return false;
    // Staff Activity is admin-only
    if (item.path === "/more/staff-activity" && profile?.role !== "admin") return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md mx-auto pb-24">
      <AppHeader />

      {/* Shop Profile Card – Shop logo, user name, email/phone */}
      <div
        className="mx-page mt-2 bg-white rounded-2xl p-4 shadow-sm cursor-pointer"
        onClick={() => navigate("/shop-profile")}
      >
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-blue-100">
            {pharmacyLogo ? (
              <AvatarImage src={pharmacyLogo} alt="Shop" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-teal-500 text-white text-lg font-bold">
              {getShopInitials(pharmacyName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 text-fluid-base truncate">{profile?.full_name || "User"}</p>
            <p className="text-fluid-sm text-gray-500 truncate">{contactInfo}</p>
            <p className="text-fluid-xs text-gray-400 truncate mt-0.5">{pharmacyName || "Your Pharmacy"}</p>
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-page pt-5 space-y-2">
        {menuItems.map(({ label, icon: Icon, path, color }) => (
          <button
            key={label}
            onClick={() => path && navigate(path)}
            className="w-full flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm text-left"
          >
            <Icon size={20} className={color} />
            <span className="flex-1 font-medium text-gray-800 text-fluid-sm">{label}</span>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default More;
