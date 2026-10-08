import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Package,
  Settings,
  ChevronRight,
  Store,
  Wallet,
  Users,
  StickyNote,
  CreditCard,
  UserCog,
  Building2,
  Truck,
  Warehouse,
  ClipboardList,
  Inbox,
  ClipboardCheck,
  Briefcase,
  ArrowRightLeft,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const More = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const { activeLocation, isWarehouse: ctxIsWarehouse } = useLocationStore();
  const [pharmacyLogo, setPharmacyLogo] = useState<string | null>(null);

  const isWarehouse =
    ctxIsWarehouse ??
    (activeLocation?.type === "warehouse" || (activeLocation?.type as string) === "godown");

  useEffect(() => {
    const fetchPharmacyLogo = async () => {
      if (activeLocation?.logo_url) {
        setPharmacyLogo(activeLocation.logo_url);
        return;
      }
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
  }, [profile?.pharmacy_id, activeLocation?.logo_url]);

  const getShopInitials = (name: string | null) =>
    name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "S";

  const userRole = (profile?.role || "").toLowerCase().trim();
  const isOwner = userRole === "owner";

  // Build contextual menu items
  const menuItems = isWarehouse
    ? [
        { label: "Add Inventory", icon: Package, path: "/inventory", color: "text-blue-600" },
        { label: "Stock Movements", icon: ArrowRightLeft, path: "/stock-movements", color: "text-indigo-600" },
        { label: "Smart Requisitions (SR)", icon: Sparkles, path: "/procurement/smart-requisitions", color: "text-purple-600" },
        { label: "Suppliers & Vendors", icon: Briefcase, path: "/procurement/suppliers", color: "text-blue-600" },
        { label: "Purchase Orders (PO)", icon: ClipboardList, path: "/procurement/purchase-orders", color: "text-amber-600" },
        { label: "Stock Reconciliation", icon: ClipboardCheck, path: "/warehouse/audit", color: "text-teal-600" },
        ...(isOwner ? [{ label: "Branches & Warehouses", icon: Building2, path: "/locations", color: "text-amber-600" }] : []),
        { label: "Smart Notepad", icon: StickyNote, path: "/more/notes", color: "text-[#2563eb]" },
        { label: "Manage Staff", icon: UserCog, path: "/staff-management", color: "text-emerald-600" },
        { label: "Warehouse Profile", icon: Warehouse, path: "/shop-profile", color: "text-teal-600" },
        { label: "Subscription", icon: CreditCard, path: "/subscription", color: "text-blue-600" },
        { label: "Settings", icon: Settings, path: null, color: "text-gray-500" },
      ]
    : [
        { label: "Add Inventory", icon: Package, path: "/inventory", color: "text-blue-600" },
        { label: "Stock Movements", icon: ArrowRightLeft, path: "/stock-movements", color: "text-indigo-600" },
        { label: "Smart Requisitions (SR)", icon: Sparkles, path: "/procurement/smart-requisitions", color: "text-purple-600" },
        { label: "Suppliers & Vendors", icon: Briefcase, path: "/procurement/suppliers", color: "text-blue-600" },
        { label: "Purchase Orders (PO)", icon: ClipboardList, path: "/procurement/purchase-orders", color: "text-amber-600" },
        ...(isOwner ? [{ label: "Branches & Warehouses", icon: Building2, path: "/locations", color: "text-amber-600" }] : []),
        { label: "Customers", icon: Users, path: "/more/customers", color: "text-purple-600" },
        { label: "Smart Notepad", icon: StickyNote, path: "/more/notes", color: "text-[#2563eb]" },
        ...(userRole !== "salesman" ? [{ label: "Daily Transactions", icon: Wallet, path: "/more/daily-transactions", color: "text-teal-600" }] : []),
        { label: "Manage Staff", icon: UserCog, path: "/staff-management", color: "text-emerald-600" },
        { label: "Shop Profile", icon: Store, path: "/shop-profile", color: "text-teal-600" },
        { label: "Subscription", icon: CreditCard, path: "/subscription", color: "text-blue-600" },
        { label: "Settings", icon: Settings, path: null, color: "text-gray-500" },
      ];

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-md mx-auto pb-24">

      {/* Static Identity Card – Shop logo, user name, shop name */}
      <div className="mx-page mt-2 bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-red-100">
            {pharmacyLogo ? (
              <AvatarImage src={pharmacyLogo} alt="Shop" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-red-50 text-[#CC3333] text-lg font-bold">
              {getShopInitials(activeLocation?.name || pharmacyName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <p className="font-bold text-gray-900 text-fluid-base truncate">{profile?.full_name || "User"}</p>
            <p className="text-fluid-sm font-semibold text-slate-800 truncate">
              {activeLocation?.name || pharmacyName || "Your Pharmacy"}
            </p>
            {pharmacyName && pharmacyName !== activeLocation?.name && (
              <p className="text-[11px] text-slate-400 truncate">Parent: {pharmacyName}</p>
            )}
          </div>
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
