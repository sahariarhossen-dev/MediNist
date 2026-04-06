import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Search, Bell, Pill, Plus, X, Check, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { totalPiecesToTriUnit, boxesToPieces } from "@/lib/stockUtils";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  strip_per_pack: number | null;
  pcs_per_strip: number | null;
  product_type: string | null;
  product_size: string | null;
  stock_alert: number | null;
}

const TriUnitDisplay = ({ totalPcs, stripPerPack, pcsPerStrip }: { totalPcs: number; stripPerPack: number | null; pcsPerStrip: number | null }) => {
  const display = totalPiecesToTriUnit(totalPcs, stripPerPack, pcsPerStrip);
  const parts = display.split(" : ");
  return (
    <span className="font-mono font-bold text-foreground">
      {parts[0]}<span className="text-muted-foreground mx-0.5">:</span>{parts[1]}<span className="text-muted-foreground mx-0.5">:</span>{parts[2]}
    </span>
  );
};

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

  // Long press state
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

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
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (!searchOpen) return;
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getCalculatedStock = (med: Medicine) => {
    const units = Number(unitInputs[med.id] || 0);
    const addedPieces = boxesToPieces(units, med.strip_per_pack, med.pcs_per_strip);
    return (med.stock_quantity || 0) + addedPieces;
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
      toast.success(`${med.name} stock updated`);
      setMedicines((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, stock_quantity: newStock } : m))
      );
      setUnitInputs((prev) => ({ ...prev, [med.id]: "" }));
      setExpandedId(null);
    }
    setSavingId(null);
  };

  // Long press handlers
  const startPress = (id: string, clientX: number, clientY: number) => {
    touchStartPos.current = { x: clientX, y: clientY };
    longPressFiredRef.current = false;
    setPressingId(id);
    pressTimerRef.current = setTimeout(() => {
      setPressingId(null);
      setLongPressId(id);
      setDeleteConfirmId(null);
      longPressFiredRef.current = true;
    }, 1500);
  };

  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setPressingId(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) cancelPress();
  };

  const handleEdit = (med: Medicine) => {
    setLongPressId(null);
    navigate("/add-product", {
      state: {
        editId: med.id,
        name: med.name,
        companyName: med.company_name || "",
        productType: med.product_type || "",
        stripPerPack: med.strip_per_pack?.toString() || "",
        pcsPerStrip: med.pcs_per_strip?.toString() || "",
        productSize: med.product_size || "",
        totalQuantity: med.stock_quantity?.toString() || "",
        stockAlert: med.stock_alert?.toString() || "",
        mrp: med.price?.toString() || "",
      },
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const med = medicines.find((m) => m.id === deleteConfirmId);
    const { error } = await supabase.from("medicines").delete().eq("id", deleteConfirmId);
    if (error) {
      toast.error("Failed to delete product");
    } else {
      toast.success(`${med?.name || "Product"} deleted`);
      setMedicines((prev) => prev.filter((m) => m.id !== deleteConfirmId));
    }
    setDeleteConfirmId(null);
    setLongPressId(null);
  };

  const longPressMed = longPressId ? medicines.find((m) => m.id === longPressId) : null;

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Top Header */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
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
                onTouchStart={(e) => startPress(med.id, e.touches[0].clientX, e.touches[0].clientY)}
                onTouchEnd={cancelPress}
                onTouchMove={handleTouchMove}
                onMouseDown={(e) => startPress(med.id, e.clientX, e.clientY)}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                className={`bg-muted rounded-2xl transition-all duration-150 overflow-hidden select-none ${
                  searchOpen ? "cursor-pointer active:scale-[0.99]" : ""
                } ${pressingId === med.id ? "scale-95" : ""}`}
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
                        ref={(el) => {
                          if (el && isExpanded) {
                            setTimeout(() => el.focus(), 50);
                          }
                        }}
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
                    <div className="flex-shrink-0">
                      <TriUnitDisplay
                        totalPcs={med.stock_quantity || 0}
                        stripPerPack={med.strip_per_pack}
                        pcsPerStrip={med.pcs_per_strip}
                      />
                    </div>
                  )}
                </div>

                {/* Row 2: Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-4 text-xs font-medium bg-background rounded-xl px-4 py-2.5">
                      <span className="text-foreground">
                        ৳ {med.price ?? "—"}
                      </span>
                      <span className="text-muted-foreground">
                        pre-stock :{" "}
                        <TriUnitDisplay
                          totalPcs={med.stock_quantity || 0}
                          stripPerPack={med.strip_per_pack}
                          pcsPerStrip={med.pcs_per_strip}
                        />
                      </span>
                      <span className="text-primary font-semibold">
                        Current :{" "}
                        <TriUnitDisplay
                          totalPcs={calculatedStock}
                          stripPerPack={med.strip_per_pack}
                          pcsPerStrip={med.pcs_per_strip}
                        />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Long Press Action Overlay */}
      {longPressMed && !deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLongPressId(null)}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-[280px] p-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-foreground text-center mb-1 truncate">{longPressMed.name}</p>
            <p className="text-xs text-muted-foreground text-center mb-5 truncate">{longPressMed.company_name || "No company"}</p>

            <div className="space-y-2.5">
              <button
                onClick={() => handleEdit(longPressMed)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-accent transition-colors"
              >
                <Pencil size={18} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Edit Product</span>
              </button>
              <button
                onClick={() => setDeleteConfirmId(longPressMed.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={18} className="text-destructive" />
                <span className="text-sm font-semibold text-destructive">Delete Product</span>
              </button>
            </div>

            <button
              onClick={() => setLongPressId(null)}
              className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && longPressMed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => { setDeleteConfirmId(null); setLongPressId(null); }}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl w-[300px] p-6 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 size={24} className="text-destructive" />
              </div>
            </div>
            <p className="text-sm font-bold text-foreground text-center mb-1">Delete Product?</p>
            <p className="text-xs text-muted-foreground text-center mb-5">
              Are you sure you want to delete <span className="font-semibold text-foreground">{longPressMed.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirmId(null); setLongPressId(null); }}
                className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
