import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, Bell, Pill, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface Medicine {
  id: string;
  name: string;
  generic_name: string | null;
  price: number | null;
  stock_quantity: number | null;
}

const Inventory = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedicines = async () => {
      if (!profile?.pharmacy_id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("medicines")
        .select("*")
        .eq("pharmacy_id", profile.pharmacy_id)
        .order("name", { ascending: true });
      setMedicines(data || []);
      setLoading(false);
    };
    fetchMedicines();
  }, [profile?.pharmacy_id]);

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top Header */}
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

      {/* Add Inventory Title + Search */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Add Inventory</h2>
        <button className="p-2 rounded-full bg-muted">
          <Search size={18} className="text-foreground" />
        </button>
      </div>

      {/* Add New Product Button */}
      <div className="px-5 pb-4">
        <button
          onClick={() => navigate("/add-product")}
          className="w-full flex items-center justify-center gap-2 bg-muted rounded-xl py-3.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          <Plus size={18} />
          Add New Product
        </button>
      </div>

      {/* Medicine List */}
      <div className="px-5 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))
        ) : medicines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Pill size={48} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">No medicines added yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Tap + to start.</p>
          </div>
        ) : (
          medicines.map((med) => (
            <div
              key={med.id}
              className="flex items-center gap-4 bg-muted rounded-2xl p-4"
            >
              {/* Pill Icon */}
              <div className="flex-shrink-0 h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
                <Pill size={20} className="text-primary" />
              </div>
              {/* Name & Generic */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{med.name}</p>
                <p className="text-xs text-muted-foreground truncate">{med.generic_name || "—"}</p>
              </div>
              {/* Price */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-lg">💰</span>
                <span className="font-bold text-foreground">{med.price ?? "—"}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Inventory;
