import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Package, User, Settings, LogOut, ChevronRight, Bell } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const menuItems = [
  { label: "Add Inventory", icon: Package, path: "/inventory" },
  { label: "Profile", icon: User, path: null },
  { label: "Settings", icon: Settings, path: null },
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
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Medinist</h1>
          <p className="text-xs mt-0.5 text-secondary-foreground">{pharmacyName || "Your Pharmacy"}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-full bg-muted">
            <Bell size={18} className="text-foreground" />
          </button>
          <Avatar className="h-9 w-9 border-2 border-primary">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {getInitials(profile?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* User Info Card */}
      <div className="px-5 pt-4 pb-2">
        <div className="bg-muted rounded-2xl p-4 flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-primary">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
              {getInitials(profile?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{profile?.full_name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.phone || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{pharmacyName || "—"}</p>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-5 pt-4 space-y-2">
        {menuItems.map(({ label, icon: Icon, path }) => (
          <button
            key={label}
            onClick={() => path && navigate(path)}
            className="w-full flex items-center gap-4 bg-muted rounded-2xl p-4 hover:bg-accent transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon size={20} className="text-primary" />
            </div>
            <span className="flex-1 font-medium text-foreground">{label}</span>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 bg-destructive/10 rounded-2xl p-4 hover:bg-destructive/20 transition-colors text-left"
        >
          <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
            <LogOut size={20} className="text-destructive" />
          </div>
          <span className="flex-1 font-medium text-destructive">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default More;
