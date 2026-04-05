import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Search, Bell, Pill, Plus, X, Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  strip_per_pack: number | null;
  pcs_per_strip: number | null;
  product_type: string | null;
}

const Inventory = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unitInputs, setUnitInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

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
    setExpandedId(null);
    setUnitInputs({});
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    searchRef.current?.focus();
  };

  const handleCardClick = (id: string) => {
    if (!searchQuery) return;
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getCalculatedStock = (med: Medicine) => {
    const units = Number(unitInputs[med.id] || 0);
    const multiplier = med.strip_per_pack || 1;
    return (med.stock_quantity || 0) + units * multiplier;
  };

  const handleConfirmStock = async (med: Medicine) => {
    const units = Number(unitInputs[med.id] || 0);
    if (units <= 0) return;

    setSavingId(med.id);
    const newStock = getCalculatedStock(med);
    const { error } = await supabase
      .from("medicines")
      .update({ stock_quantity: newStock })
      .eq("id", med.id);

    if (error) {
      toast.error("Failed to update stock");
    } else {
      toast.success(`${med.name} stock updated to ${newStock}`);
      setMedicines((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, stock_quantity: newStock } : m))
      );
      setUnitInputs((prev) => ({ ...prev, [med.id]: "" }));
      setExpandedId(null);
    }
    setSavingId(null);
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
            <div className="relative flex-1">
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search medicines..."
                className="flex-1 h-10 rounded-xl border-muted bg-muted pr-9 focus-visible:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={handleCloseSearch}
              className="p-2 rounded-full bg-muted text-foreground flex-shrink-0"
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
          filteredMedicines.map((med) => {
            const isExpanded = expandedId === med.id;
            const units = Number(unitInputs[med.id] || 0);
            const calculatedStock = getCalculatedStock(med);

            return (
              <div
                key={med.id}
                onClick={() => handleCardClick(med.id)}
                className={`bg-muted rounded-2xl transition-all duration-200 overflow-hidden ${
                  searchQuery ? "cursor-pointer active:scale-[0.99]" : ""
                }`}
              >
                {/* Row 1: Basic info */}
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-shrink-0 h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
                    <Pill size={20} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{med.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {med.company_name || "—"}
                    </p>
                  </div>

                  {isExpanded ? (
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={unitInputs[med.id] || ""}
                        onChange={(e) =>
                          setUnitInputs((prev) => ({ ...prev, [med.id]: e.target.value }))
                        }
                        className="w-16 h-9 text-center rounded-lg border border-border bg-background text-sm font-semibold"
                      />
                      <button
                        onClick={() => handleConfirmStock(med)}
                        disabled={units <= 0 || savingId === med.id}
                        className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-colors"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-lg">💰</span>
                      <span className="font-bold text-foreground">{med.price ?? "—"}</span>
                    </div>
                  )}
                </div>

                {/* Row 2: Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-4 text-xs font-medium bg-background rounded-xl px-4 py-2.5">
                      <span className="text-foreground">
                        ৳ {med.price ?? "—"}
                      </span>
                      <span className="text-muted-foreground">
                        pre-stock : <span className="text-foreground">{med.stock_quantity ?? 0}</span>
                      </span>
                      <span className="text-primary font-semibold">
                        Current stock : {calculatedStock}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Inventory;
