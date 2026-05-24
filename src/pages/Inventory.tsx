import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Search, Pill, Plus, X, Check, Pencil, Trash2, Loader2, SlidersHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AppHeader from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { totalPiecesToTriUnitObj, boxesToPieces, isSingleUnit } from "@/lib/stockUtils";
import { truncateName, truncateStrength } from "@/lib/formatUtils";
import { normalizeForSearch } from "@/lib/searchUtils";
import { toFunctionalType, getProductTypeChipClasses, getStandardizedType, getDisplayFormat, getDisplayCategory } from "@/lib/productType";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  strip_per_pack: number | null;
  pcs_per_strip: number | null;
  product_type: string | null;
  unit_format: string | null;
  product_size: string | null;
  stock_alert: number | null;
}

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

const computeStripPerPack = (packSize: string | null, boxSize: string | null): number | null => {
  const pcs = parsePackSize(packSize);
  const box = parsePackSize(boxSize);
  if (!pcs || !box || pcs === 0) return null;
  const result = Math.floor(box / pcs);
  return result > 0 ? result : null;
};

// Build a Postgres tsquery from raw user input. Strips punctuation,
// splits on whitespace, appends `:*` to each token for prefix matching,
// and AND-joins so all typed tokens must match. Returns "" for empty.
const toTsQuery = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(" & ");

const TriUnitDisplay = ({ totalPcs, stripPerPack, pcsPerStrip, productType }: { totalPcs: number; stripPerPack: number | null; pcsPerStrip: number | null; productType?: string | null }) => {
  if (isSingleUnit({ pcs_per_strip: pcsPerStrip, strip_per_pack: stripPerPack })) {
    return (
      <span className="font-mono font-bold text-gray-900 tabular-nums whitespace-nowrap">
        {totalPcs}
      </span>
    );
  }
  const { boxes, strips, pcs } = totalPiecesToTriUnitObj(totalPcs, stripPerPack, pcsPerStrip);
  return (
    <span className="font-mono font-bold text-gray-900 tabular-nums whitespace-nowrap text-[11px]">
      {boxes}
      <span className="text-gray-300 mx-1">•</span>
      {strips}
      <span className="text-gray-300 mx-1">•</span>
      {pcs}
    </span>
  );
};

const Inventory = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [catalog, setCatalog] = useState<MasterMedicine[]>([]);
  const [catalogCompanies, setCatalogCompanies] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedCatalogId, setExpandedCatalogId] = useState<string | null>(null);
  const [unitInputs, setUnitInputs] = useState<Record<string, string>>({});
  const [catalogQty, setCatalogQty] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingCatalog, setAddingCatalog] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [companySearch, setCompanySearch] = useState("");

  // Long press state
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.pharmacy_id) {
        setLoading(false);
        return;
      }
      const medsRes = await supabase
        .from("medicines")
        .select("*")
        .eq("pharmacy_id", profile.pharmacy_id)
        .order("name", { ascending: true });
      setMedicines(medsRes.data || []);
      setLoading(false);

      // Fetch full distinct company list from master_medicines.
      // Paginated because the table has ~21k rows (Supabase caps at 1000/call).
      try {
        const PAGE = 1000;
        const seen = new Set<string>();
        let from = 0;
        // Cap iterations to avoid runaway loops if the table grows huge.
        for (let i = 0; i < 50; i++) {
          const { data, error } = await supabase
            .from("master_medicines")
            .select("company")
            .order("company", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          for (const row of data) {
            if (row.company) seen.add(row.company);
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        setCatalogCompanies(Array.from(seen).sort((a, b) => a.localeCompare(b)));
      } catch {
        // Non-fatal — filter list will just be derived from local medicines.
      }
    };
    fetchData();
  }, [profile?.pharmacy_id]);

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  // Unique company names from both sources
  const allCompanies = useMemo(() => {
    const names = new Set<string>();
    medicines.forEach((m) => { if (m.company_name) names.add(m.company_name); });
    catalogCompanies.forEach((c) => names.add(c));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [medicines, catalogCompanies]);

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return allCompanies;
    const q = companySearch.toLowerCase();
    return allCompanies.filter((c) => c.toLowerCase().includes(q));
  }, [allCompanies, companySearch]);

  const toggleCompany = (name: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedCompanies(new Set());
    setCompanySearch("");
  };

  // Filter local medicines
  const filteredMedicines = useMemo(
    () => {
      let result = medicines;
      if (searchQuery) {
        const q = normalizeForSearch(searchQuery);
        if (q) {
          result = result.filter((m) => normalizeForSearch(m.name).includes(q));
        }
      }
      if (selectedCompanies.size > 0) {
        result = result.filter((m) => m.company_name && selectedCompanies.has(m.company_name));
      }
      return result;
    },
    [medicines, searchQuery, selectedCompanies]
  );

  // Dual-section view is active whenever the user is filtering by company
  // or actively searching. Otherwise we show only the default inventory list.
  const isDualMode = selectedCompanies.size > 0 || !!searchQuery.trim();

  // Debounce the search input so we don't hit Supabase on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // On-demand catalog fetch: server-side filter by company and/or search.
  // Replaces the previous mount-time full-table load that was silently
  // truncated to the first 1000 rows by Supabase's default limit.
  useEffect(() => {
    if (!isDualMode) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    const reqId = Symbol("catalog-fetch");
    (window as any).__catalogReqId = reqId;

    const run = async () => {
      setCatalogLoading(true);
      let q = supabase
        .from("master_medicines")
        .select("*")
        .order("brand_name", { ascending: true })
        .range(0, 4999);

      if (selectedCompanies.size > 0) {
        q = q.in("company", Array.from(selectedCompanies));
      }
      if (debouncedSearch) {
        const term = debouncedSearch.replace(/[%,]/g, " ");
        q = q.or(
          `brand_name.ilike.%${term}%,generic_name.ilike.%${term}%,company.ilike.%${term}%`
        );
      }

      const { data, error } = await q;
      if (cancelled || (window as any).__catalogReqId !== reqId) return;
      if (!error) setCatalog(data || []);
      setCatalogLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isDualMode, selectedCompanies, debouncedSearch]);

  // Filter catalog results (exclude items already in local inventory).
  // Server already filtered by company/search; we just dedupe against
  // medicines already present in the local inventory.
  const filteredCatalog = useMemo(() => {
    if (!isDualMode) return [];
    const localKeys = new Set(
      medicines.map((m) => `${m.name.toLowerCase()}|${(m.company_name || "").toLowerCase()}`)
    );
    const result = catalog.filter(
      (m) => !localKeys.has(`${m.brand_name.toLowerCase()}|${(m.company || "").toLowerCase()}`)
    );
    return result.sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [catalog, medicines, isDualMode]);

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "U";

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setExpandedId(null);
    setExpandedCatalogId(null);
    setUnitInputs({});
    setCatalogQty("");
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
    setExpandedCatalogId(null);
    setCatalogQty("");
  };

  const handleCatalogCardClick = (id: string) => {
    setExpandedCatalogId((prev) => (prev === id ? null : id));
    setExpandedId(null);
    setCatalogQty("");
  };

  const parseStockInput = (raw: string, med: Medicine) => {
    const value = (raw ?? "").trim();
    if (!value) return { addedPieces: 0, isTriple: false };
    const spp = med.strip_per_pack || 1;
    const pps = med.pcs_per_strip || 1;
    if (value.includes(".")) {
      const [bRaw = "", sRaw = "", pRaw = ""] = value.split(".");
      const b = Math.max(0, parseInt(bRaw, 10) || 0);
      const s = Math.max(0, parseInt(sRaw, 10) || 0);
      const p = Math.max(0, parseInt(pRaw, 10) || 0);
      return { addedPieces: b * spp * pps + s * pps + p, isTriple: true };
    }
    const num = Math.max(0, parseInt(value, 10) || 0);
    return { addedPieces: num * spp * pps, isTriple: false };
  };

  const getCalculatedStock = (med: Medicine) => {
    const { addedPieces } = parseStockInput(unitInputs[med.id] || "", med);
    return (med.stock_quantity || 0) + addedPieces;
  };

  const handleConfirmStock = async (med: Medicine) => {
    const { addedPieces } = parseStockInput(unitInputs[med.id] || "", med);
    if (addedPieces <= 0) return;
    setSavingId(med.id);
    const newStock = getCalculatedStock(med);
    const { error } = await supabase.from("medicines").update({ stock_quantity: newStock }).eq("id", med.id);
    if (error) {
      toast.error("Failed to update stock");
    } else {
      toast.success(`${med.name} stock updated`);
      setMedicines((prev) => prev.map((m) => (m.id === med.id ? { ...m, stock_quantity: newStock } : m)));
      setUnitInputs((prev) => ({ ...prev, [med.id]: "" }));
      setExpandedId(null);
    }
    setSavingId(null);
  };

  const handleAddFromCatalog = async (med: MasterMedicine) => {
    if (!profile?.pharmacy_id) {
      toast.error("No pharmacy linked");
      return;
    }
    setAddingCatalog(true);
    const pcsPerStrip = parsePackSize(med.pack_size);
    const stripPerPack = computeStripPerPack(med.pack_size, med.box_size);
    const rawQty = parseInt(catalogQty, 10) || 0;
    const functionalType = toFunctionalType(med.format);
    // Keep verbatim format for unmappable types so the pharmacy still gets a
    // sensible custom bucket (e.g. "Eye Drop") in the product-type dropdown.
    const productTypeBucket =
      functionalType === "Other" && med.format ? med.format : functionalType;
    const isMultiUnit = !isSingleUnit({ pcs_per_strip: pcsPerStrip, strip_per_pack: stripPerPack });
    const stockQty = isMultiUnit ? boxesToPieces(rawQty, stripPerPack, pcsPerStrip) : rawQty;

    const { data: inserted, error } = await supabase.from("medicines").insert({
      pharmacy_id: profile.pharmacy_id,
      name: med.brand_name,
      company_name: med.company || null,
      product_type: productTypeBucket,
      unit_format: med.format || null,
      product_size: med.strength || null,
      price: med.unit_price || null,
      stock_quantity: stockQty,
      pcs_per_strip: pcsPerStrip,
      strip_per_pack: stripPerPack,
    }).select().single();

    if (error) {
      toast.error("Failed to add product");
    } else {
      toast.success(`${med.brand_name} added to inventory`);
      if (inserted) {
        setMedicines((prev) => [...prev, inserted as Medicine].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setExpandedCatalogId(null);
      setCatalogQty("");
    }
    setAddingCatalog(false);
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
    const rawStrength = med.product_size ? med.product_size.replace(/[^0-9.]/g, "") : "";
    navigate("/add-product", {
      state: {
        editId: med.id,
        name: med.name,
        companyName: med.company_name || "",
        productType: med.product_type || "",
        stripPerBox: med.strip_per_pack?.toString() || "",
        pcsPerStrip: med.pcs_per_strip?.toString() || "",
        strength: rawStrength,
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
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Top Header */}
      <AppHeader />

      {/* Search Bar */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 py-0 my-0">
        {searchOpen ? (
          <div className="flex-1 flex items-center gap-2 animate-in slide-in-from-right-4 duration-200">
            <div className="relative flex-1 min-w-0">
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inventory & catalog..."
                className="flex-1 h-10 rounded-xl border-muted bg-muted pr-9 focus-visible:ring-primary"
              />
              {searchQuery && (
                <button onClick={handleClearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
            {selectedCompanies.size > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex-shrink-0"
              >
                {selectedCompanies.size} filter{selectedCompanies.size > 1 ? "s" : ""}
                <X size={12} />
              </button>
            )}
            <button
              onClick={() => setFilterOpen(true)}
              className="relative p-2 rounded-full bg-muted text-foreground flex-shrink-0"
            >
              <SlidersHorizontal size={18} />
              {selectedCompanies.size > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary" />
              )}
            </button>
            <button onClick={handleCloseSearch} className="p-2 rounded-full bg-muted text-foreground flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                aria-label="Back"
                className="p-2 rounded-full hover:bg-muted transition"
              >
                <ArrowLeft size={20} className="text-foreground" />
              </button>
              <h2 className="text-lg font-bold text-foreground">Add Inventory</h2>
            </div>
            <button onClick={() => setSearchOpen(true)} className="p-2 rounded-full bg-muted">
              <Search size={18} className="text-foreground" />
            </button>
          </>
        )}
      </div>

      {/* Add New Product Button - visible only when not searching */}
      {!searchOpen && (
        <div className="px-5 mt-3">
          <button
            onClick={() => navigate("/add-product")}
            className="w-full py-3 rounded-xl text-primary font-medium flex items-center justify-center active:scale-[0.98] transition-all my-[10px] gap-[10px] border border-primary border-solid"
          >
            <Plus size={18} /> Add New Product
          </button>
        </div>
      )}

      {/* Medicine List */}
      <div className="px-5 space-y-3.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))
        ) : (
          <>
            {/* Section: In Your Inventory */}
            {filteredMedicines.length === 0 && !isDualMode ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Pill size={48} className="text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-medium">No medicines added yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Use the search to find and add medicines.</p>
              </div>
            ) : (
              <>
                {isDualMode && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                    In Your Inventory ({filteredMedicines.length})
                  </p>
                )}
                {isDualMode && filteredMedicines.length === 0 && (
                  <div className="bg-white/60 border border-dashed border-gray-200 rounded-2xl py-6 text-center">
                    <p className="text-xs text-muted-foreground">No items from this selection in your shop yet.</p>
                  </div>
                )}
                {filteredMedicines.map((med) => {
                  const isExpanded = expandedId === med.id;
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
                      className={`bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-200/60 transition-all duration-150 overflow-hidden select-none ${
                        searchOpen ? "cursor-pointer active:scale-[0.99]" : ""
                      } ${pressingId === med.id ? "scale-95" : ""}`}
                    >
                      <div className="flex items-center gap-3.5 p-4">
                        <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center">
                          <Pill size={20} className="text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                            <span className="truncate">{truncateName(med.name)}</span>
                            {med.product_size && <span className="text-[10px] text-gray-400 font-normal flex-shrink-0">{truncateStrength(med.product_size)}</span>}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 min-w-0">
                            <span className="text-[11px] text-gray-400 truncate min-w-0">{med.company_name || "—"}</span>
                            {(med.product_type || med.unit_format) && (
                              <span
                                title={getDisplayFormat(med) || undefined}
                                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${getProductTypeChipClasses(med.product_type || med.unit_format)}`}
                              >
                                {getDisplayCategory(med.product_type || med.unit_format)}
                              </span>
                            )}
                          </div>
                        </div>
                         {isExpanded ? (() => {
                            const rawInput = unitInputs[med.id] || "";
                            const { addedPieces, isTriple } = parseStockInput(rawInput, med);
                            const label = isTriple ? "B.S.P" : isSingleUnit(med) ? "Qty" : "Box";
                            return (
                              <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0">{label}</span>
                                <Input
                                  autoFocus
                                  type="text"
                                  inputMode="decimal"
                                  pattern="[0-9.]*"
                                  placeholder="B.S.P e.g. 0.1.0"
                                  title="Box.Strip.Piece (e.g. 0.1.0 = 1 strip). Single number = Boxes."
                                  value={rawInput}
                                  onChange={(e) => {
                                    let cleaned = e.target.value
                                      .replace(/[^0-9.]/g, "")
                                      .replace(/\.{2,}/g, ".");
                                    // Cap at two dots (B.S.P = three segments)
                                    const parts = cleaned.split(".");
                                    if (parts.length > 3) {
                                      cleaned = parts.slice(0, 3).join(".") + parts.slice(3).join("");
                                    }
                                    setUnitInputs((prev) => ({ ...prev, [med.id]: cleaned }));
                                  }}
                                  className="w-24 h-9 text-center rounded-lg border border-border bg-background text-sm font-semibold"
                                />
                                <button
                                  onClick={() => handleConfirmStock(med)}
                                  disabled={addedPieces <= 0 || savingId === med.id}
                                  className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-colors"
                                >
                                  <Check size={16} />
                                </button>
                              </div>
                            );
                          })() : (
                          <div className="flex-shrink-0">
                            <TriUnitDisplay totalPcs={med.stock_quantity || 0} stripPerPack={med.strip_per_pack} pcsPerStrip={med.pcs_per_strip} productType={med.product_type} />
                          </div>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-4 text-xs font-medium bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                            <span className="text-gray-900 font-semibold">৳ {med.price ?? "—"}</span>
                            <span className="text-gray-400">
                              pre-stock : <TriUnitDisplay totalPcs={med.stock_quantity || 0} stripPerPack={med.strip_per_pack} pcsPerStrip={med.pcs_per_strip} productType={med.product_type} />
                            </span>
                            <span className="text-emerald-600 font-semibold">
                              Current : <TriUnitDisplay totalPcs={calculatedStock} stripPerPack={med.strip_per_pack} pcsPerStrip={med.pcs_per_strip} productType={med.product_type} />
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Section: From Catalog */}
                {isDualMode && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pt-2">
                      From Catalog ({filteredCatalog.length})
                    </p>
                    {catalogLoading && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={20} className="animate-spin text-emerald-500" />
                      </div>
                    )}
                    {!catalogLoading && filteredCatalog.length === 0 && (
                      <div className="bg-white/60 border border-dashed border-gray-200 rounded-2xl py-6 text-center">
                        <p className="text-xs text-muted-foreground">No more catalog items for this selection.</p>
                      </div>
                    )}
                    {filteredCatalog.map((med) => {
                      const isExpanded = expandedCatalogId === med.id;
                      const catalogType = toFunctionalType(med.format);
                      const catalogPcsPerStrip = parsePackSize(med.pack_size);
                      const catalogStripPerPack = computeStripPerPack(med.pack_size, med.box_size);
                      const catalogIsMulti = !isSingleUnit({
                        pcs_per_strip: catalogPcsPerStrip,
                        strip_per_pack: catalogStripPerPack,
                      });
                      return (
                        <div
                          key={med.id}
                          onClick={() => handleCatalogCardClick(med.id)}
                          className={`bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-200/60 overflow-hidden transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                            isExpanded ? "ring-1 ring-emerald-300" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3.5 p-4">
                            <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center">
                              <Plus size={20} className="text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-900 text-sm truncate flex items-center gap-1.5">
                                <span className="truncate">{med.brand_name}</span>
                                {med.strength && <span className="text-[10px] text-gray-400 font-normal flex-shrink-0">{med.strength}</span>}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate mt-0.5">{med.generic_name || "—"}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {med.company && (
                                  <span className="text-[11px] text-gray-400 truncate max-w-[55%]">{med.company}</span>
                                )}
                                {med.format && (
                                  <span
                                    title={med.format}
                                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${getProductTypeChipClasses(catalogType)}`}
                                  >
                                    {catalogType}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="font-bold text-emerald-600 text-sm tabular-nums">৳{med.unit_price ?? 0}</p>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                                <span className="text-xs text-gray-500 flex-shrink-0">{catalogIsMulti ? "Box:" : "Qty (pcs):"}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="0"
                                  value={catalogQty}
                                  onChange={(e) => setCatalogQty(e.target.value)}
                                  className="flex-1 h-9 text-center rounded-lg border-border text-sm font-semibold"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleAddFromCatalog(med)}
                                  disabled={addingCatalog}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 flex-shrink-0"
                                >
                                  {addingCatalog ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                  Add
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* No results at all */}
                {searchQuery && filteredMedicines.length === 0 && filteredCatalog.length === 0 && (
                  <div className="text-center py-16">
                    <Pill size={48} className="text-muted-foreground mb-4 mx-auto" />
                    <p className="text-muted-foreground font-medium">No medicines found</p>
                    <button
                      onClick={() => navigate("/add-product")}
                      className="mt-4 text-sm text-primary font-semibold underline-offset-2 hover:underline"
                    >
                      Can't find it? Add manually →
                    </button>
                  </div>
                )}

                {/* Manual add link at bottom of catalog results */}
                {isDualMode && filteredCatalog.length > 0 && (
                  <button
                    onClick={() => navigate("/add-product")}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-3"
                  >
                    Can't find it? Add manually →
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Company Filter Bottom Sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] flex flex-col px-4 pb-6">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base font-bold text-foreground">Filter by Company</SheetTitle>
          </SheetHeader>
          <div className="relative mb-3">
            <Input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="Search companies..."
              className="h-9 rounded-xl border-muted bg-muted pr-8 text-sm"
            />
            {companySearch && (
              <button onClick={() => setCompanySearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs text-muted-foreground">{selectedCompanies.size} selected</span>
            <button
              onClick={() => {
                if (selectedCompanies.size === filteredCompanies.length) {
                  setSelectedCompanies(new Set());
                } else {
                  setSelectedCompanies(new Set(filteredCompanies));
                }
              }}
              className="text-xs font-semibold text-primary"
            >
              {selectedCompanies.size === filteredCompanies.length && filteredCompanies.length > 0 ? "Clear All" : "Select All"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {filteredCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No companies found</p>
            ) : (
              filteredCompanies.map((company) => (
                <label
                  key={company}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedCompanies.has(company)}
                    onCheckedChange={() => toggleCompany(company)}
                  />
                  <span className="text-sm text-foreground truncate flex-1">{company}</span>
                </label>
              ))
            )}
          </div>
          <button
            onClick={() => setFilterOpen(false)}
            className="mt-3 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            Apply Filter
          </button>
        </SheetContent>
      </Sheet>
      {longPressMed && !deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setLongPressId(null)}>
          <div className="bg-background rounded-2xl shadow-2xl w-[85%] max-w-[280px] p-5 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-foreground text-center mb-1 truncate">
              {longPressMed.name}
              {longPressMed.product_size && <span className="text-xs text-muted-foreground font-normal ml-1">{longPressMed.product_size}</span>}
            </p>
            <p className="text-xs text-muted-foreground text-center mb-5 truncate">{longPressMed.company_name || "No company"}</p>
            <div className="space-y-2.5">
              <button onClick={() => handleEdit(longPressMed)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-accent transition-colors">
                <Pencil size={18} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Edit Product</span>
              </button>
              <button onClick={() => setDeleteConfirmId(longPressMed.id)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors">
                <Trash2 size={18} className="text-destructive" />
                <span className="text-sm font-semibold text-destructive">Delete Product</span>
              </button>
            </div>
            <button onClick={() => setLongPressId(null)} className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && longPressMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setDeleteConfirmId(null); setLongPressId(null); }}>
          <div className="bg-background rounded-2xl shadow-2xl w-[85%] max-w-[300px] p-6 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={() => { setDeleteConfirmId(null); setLongPressId(null); }} className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
