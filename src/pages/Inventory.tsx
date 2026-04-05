import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Search, Bell, Pill, Plus, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
}

const Inventory = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  const filteredMedicines = useMemo(
    () =>
      searchQuery
        ? medicines.filter((m) =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : medicines,
    [medicines, searchQuery]
  );

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Top Header */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full bg-primary text-primary-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Medinist</h1>
            <p className="text-xs mt-0.5 text-secondary-foreground">
              {pharmacyName || "Your Pharmacy"}
            </p>
          </div>
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
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        {searchOpen ? (
          <div className="flex-1 flex items-center gap-2 animate-in slide-in-from-right-4 duration-200">
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicines..."
              className="flex-1 h-10 rounded-xl border-muted bg-muted focus-visible:ring-primary"
            />
            <button
              onClick={handleCloseSearch}
              className="p-2 rounded-full bg-muted text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-foreground">Add Inventory</h2>
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-full bg-muted"
            >
              <Search size={18} className="text-foreground" />
            </button>
          </>
        )}
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
        ) : filteredMedicines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Pill size={48} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">
              {searchQuery ? "No medicines found." : "No medicines added yet."}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery ? "Try a different search term." : "Tap + to start."}
            </p>
          </div>
        ) : (
          filteredMedicines.map((med) => (
            <div
              key={med.id}
              className="flex items-center gap-4 bg-muted rounded-2xl p-4"
            >
              <div className="flex-shrink-0 h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
                <Pill size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{med.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {med.company_name || "—"}
                </p>
              </div>
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
