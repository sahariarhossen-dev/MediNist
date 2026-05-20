import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Search, X, Plus, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeForSearch } from "@/lib/searchUtils";
import { toFunctionalType } from "@/lib/productType";

interface MasterMedicine {
  id: string;
  brand_name: string;
  generic_name: string | null;
  strength: string | null;
  unit_price: number | null;
  company: string | null;
  format: string | null;
  pack_size: string | null;
  box_size: string | null;
}

const parsePackSize = (val: string | null): number | null => {
  if (!val || val === "N/A") return null;
  const match = val.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

const computeStripPerPack = (
  packSize: string | null,
  boxSize: string | null
): number | null => {
  const pcs = parsePackSize(packSize);
  const box = parsePackSize(boxSize);
  if (!pcs || !box || pcs === 0) return null;
  const result = Math.floor(box / pcs);
  return result > 0 ? result : null;
};

const CatalogSearch = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<MasterMedicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCatalog = async () => {
      const { data, error } = await supabase
        .from("master_medicines")
        .select("*")
        .order("brand_name", { ascending: true });

      if (error) {
        toast.error("Failed to load catalog");
      } else {
        setCatalog(data || []);
      }
      setLoading(false);
    };
    fetchCatalog();
  }, []);

  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return catalog;
    const q = normalizeForSearch(searchQuery);
    if (!q) return catalog;
    return catalog.filter(
      (m) =>
        normalizeForSearch(m.brand_name).includes(q) ||
        (m.generic_name && normalizeForSearch(m.generic_name).includes(q)) ||
        (m.company && normalizeForSearch(m.company).includes(q))
    );
  }, [catalog, searchQuery]);

  const handleExpand = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
      setQuantity("");
    },
    []
  );

  const handleAddToInventory = async (med: MasterMedicine) => {
    if (!profile?.pharmacy_id) {
      toast.error("No pharmacy linked to your profile");
      return;
    }

    setAdding(true);

    // Duplicate check
    const { data: existing } = await supabase
      .from("medicines")
      .select("id")
      .eq("pharmacy_id", profile.pharmacy_id)
      .eq("name", med.brand_name)
      .eq("company_name", med.company || "")
      .maybeSingle();

    if (existing) {
      toast.info("Already in your inventory");
      setAdding(false);
      return;
    }

    const pcsPerStrip = parsePackSize(med.pack_size);
    const stripPerPack = computeStripPerPack(med.pack_size, med.box_size);
    const qty = parseInt(quantity, 10) || 0;

    const { error } = await supabase.from("medicines").insert({
      pharmacy_id: profile.pharmacy_id,
      name: med.brand_name,
      company_name: med.company || null,
      product_type: (() => {
        const std = toFunctionalType(med.format);
        return std === "Other" && med.format ? med.format : std;
      })(),
      unit_format: med.format || null,
      price: med.unit_price || null,
      stock_quantity: qty,
      pcs_per_strip: pcsPerStrip,
      strip_per_pack: stripPerPack,
    });

    if (error) {
      toast.error("Failed to add product");
    } else {
      toast.success(`${med.brand_name} added to inventory`);
      setExpandedId(null);
      setQuantity("");
    }
    setAdding(false);
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full bg-primary text-primary-foreground flex-shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold text-foreground truncate">
            Add from Catalog
          </h1>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicine name, generic, company..."
              className="pl-9 pr-9 h-11 rounded-xl border-muted bg-muted focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="px-4 pt-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground font-medium">
              {searchQuery ? "No medicines found" : "Catalog is empty"}
            </p>
            <button
              onClick={() => navigate("/add-product")}
              className="mt-4 text-sm text-primary font-semibold underline-offset-2 hover:underline"
            >
              Can't find it? Add manually
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground px-1 pb-1">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </p>
            {filtered.map((med) => {
              const isExpanded = expandedId === med.id;
              return (
                <div
                  key={med.id}
                  onClick={() => handleExpand(med.id)}
                  className={`bg-muted rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                    isExpanded ? "ring-1 ring-primary/30" : ""
                  }`}
                >
                  {/* Card row */}
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">
                        {med.brand_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {med.generic_name || "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {med.company && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[50%]">
                            {med.company}
                          </span>
                        )}
                        {med.strength && (
                          <span className="text-[11px] bg-background px-1.5 py-0.5 rounded text-muted-foreground">
                            {med.strength}
                          </span>
                        )}
                        {med.format && (
                          <span className="text-[11px] bg-background px-1.5 py-0.5 rounded text-muted-foreground">
                            {med.format}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="font-bold text-foreground text-sm">
                        ৳{med.unit_price ?? 0}
                      </p>
                      {med.pack_size && med.pack_size !== "N/A" && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Pack: {med.pack_size}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded: quantity input */}
                  {isExpanded && (
                    <div
                      className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 bg-background rounded-xl p-2.5">
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          Qty (pcs):
                        </span>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="flex-1 h-9 text-center rounded-lg border-border text-sm font-semibold"
                          autoFocus
                        />
                        <button
                          onClick={() => handleAddToInventory(med)}
                          disabled={adding}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex-shrink-0"
                        >
                          {adding ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Plus size={14} />
                          )}
                          Add
                        </button>
                      </div>
                      <button
                        onClick={() => navigate("/add-product")}
                        className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-center"
                      >
                        Can't find it? Add manually →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default CatalogSearch;
