import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Pill, Plus, X, Check, Pencil, Trash2, Loader2, SlidersHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocationStore } from "@/contexts/LocationContext";
import { StockDistributionItem } from "@/types/inventory";
import { MOCK_INVENTORY_MEDICINES } from "@/data/mockMedicines";
import {
  calculateTotalStock,
  getStockForLocation,
  getLocationBreakdown,
} from "@/lib/multiLocationStock";
import { cn } from "@/lib/utils";
import { totalPiecesToTriUnitObj, boxesToPieces, isSingleUnit, looksSingleUnit, classifyCatalogPack } from "@/lib/stockUtils";
import { truncateName, truncateStrength } from "@/lib/formatUtils";
import { normalizeForSearch } from "@/lib/searchUtils";
import { toFunctionalType, getProductTypeChipClasses, getStandardizedType, getDisplayFormat, getDisplayCategory } from "@/lib/productType";
import { useDebounce } from "@/hooks/useDebounce";
import { reportReadOnlyBlock } from "@/lib/readOnlyAudit";
import {
  normalizePricing,
  resolveItemSellingPrice,
  resolvePcsPerBox,
} from "@/lib/pricingUtils";
import {
  InventoryUpdateModal,
  MedicineSelectionItem,
  InventoryItemPayload,
} from "@/components/inventory/InventoryUpdateModal";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  stock_distribution?: StockDistributionItem[];
  location_id?: string | null;
  branch_id?: string | null;
  medicine_id?: string | null;
  master_medicine_id?: string | null;
  strip_per_pack: number | null;
  pcs_per_strip: number | null;
  product_type: string | null;
  unit_format: string | null;
  product_size: string | null;
  stock_alert: number | null;
  generic_name?: string | null;
  box_size?: string | null;
  pack_size?: string | null;
  expiry_date?: string | null;
}

/**
 * Returns a consistent canonical key representing a unique medicine
 * to safely group duplicate rows across multiple branches.
 */
const getMedicineIdentityKey = (m: {
  id?: string;
  medicine_id?: string | null;
  master_medicine_id?: string | null;
  masterId?: string | null;
  name?: string | null;
  company_name?: string | null;
  company?: string | null;
  product_size?: string | null;
  strength?: string | null;
  product_type?: string | null;
  unit_format?: string | null;
}): string => {
  if (m.medicine_id) return `med_${m.medicine_id}`;
  if (m.master_medicine_id) return `master_${m.master_medicine_id}`;
  if (m.masterId) return `master_${m.masterId}`;
  const name = (m.name || "").trim().toLowerCase();
  const company = (m.company_name || m.company || "").trim().toLowerCase();
  const size = (m.product_size || m.strength || "").trim().toLowerCase();
  const format = (m.product_type || m.unit_format || "").trim().toLowerCase();
  return `${name}|${company}|${size}|${format}`;
};

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
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
}

// Catalog search is hyphen- and space-insensitive via the
// `search_master_medicines` RPC (normalizes both sides to [a-z0-9]).

export const getHumanStockBreakdown = (
  totalPcs: number,
  stripPerPack: number | null,
  pcsPerStrip: number | null,
  productType?: string | null
): { primary: string; subtext: string | null } => {
  if (looksSingleUnit({ pcs_per_strip: pcsPerStrip, strip_per_pack: stripPerPack, product_type: productType })) {
    return {
      primary: `${totalPcs} Pcs`,
      subtext: null,
    };
  }

  const { boxes, strips, pcs } = totalPiecesToTriUnitObj(totalPcs, stripPerPack, pcsPerStrip);
  const spp = stripPerPack || 1;
  const pps = pcsPerStrip || 1;
  const hasBoxes = spp > 1;
  const hasStrips = pps > 1;

  if (hasBoxes && hasStrips) {
    const primary = `${boxes} Bx ${strips} St${pcs > 0 ? ` ${pcs} Pcs` : ""}`;
    return {
      primary,
      subtext: `${totalPcs} Pcs`,
    };
  }

  if (hasBoxes) {
    return {
      primary: `${boxes} Bx${pcs > 0 ? ` ${pcs} Pcs` : ""}`,
      subtext: `${totalPcs} Pcs`,
    };
  }

  if (hasStrips) {
    return {
      primary: `${strips} St${pcs > 0 ? ` ${pcs} Pcs` : ""}`,
      subtext: `${totalPcs} Pcs`,
    };
  }

  return {
    primary: `${totalPcs} Pcs`,
    subtext: null,
  };
};

const TriUnitDisplay = ({ totalPcs, stripPerPack, pcsPerStrip, productType }: { totalPcs: number; stripPerPack: number | null; pcsPerStrip: number | null; productType?: string | null }) => {
  const stock = getHumanStockBreakdown(totalPcs, stripPerPack, pcsPerStrip, productType);
  return (
    <span className="font-bold text-slate-900 tabular-nums whitespace-nowrap text-xs">
      {stock.primary}
    </span>
  );
};

const BRANCH_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#6366f1"];

const formatDosageForm = (form?: string | null): string => {
  if (!form) return "";
  const trimmed = form.trim();
  if (trimmed.length > 15) {
    return `${trimmed.slice(0, 14)}...`;
  }
  return trimmed;
};

const Inventory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [refreshToken, setRefreshToken] = useState<number>(
    () => (location.state as { refresh?: number } | null)?.refresh ?? 0
  );

  useEffect(() => {
    const navRefresh = (location.state as { refresh?: number } | null)?.refresh;
    if (typeof navRefresh === "number") {
      setRefreshToken((prev) => prev + 1);
    }
  }, [location.state]);
  const { profile, pharmacyName } = useAuth();
  const { locations, activeLocation, currentUserRole } = useLocationStore();
  const effectiveRole = (currentUserRole || profile?.role || "").toLowerCase();
  const isSalesman = effectiveRole === "salesman";

  // Location filter state: defaults to activeLocation.id if present, or "all"
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => activeLocation?.id || "all");

  useEffect(() => {
    if (activeLocation?.id) {
      setSelectedLocationId(activeLocation.id);
    }
  }, [activeLocation?.id]);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [catalog, setCatalog] = useState<MasterMedicine[]>([]);
  const [catalogCompanies, setCatalogCompanies] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Bottom Sheet Modal state for 1-screen inventory addition
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedSheetMed, setSelectedSheetMed] = useState<MedicineSelectionItem | null>(null);

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
        setMedicines([]);
        setLoading(false);
        return;
      }
      try {
        const medsQuery = supabase
          .from("medicines")
          .select("*")
          .eq("pharmacy_id", profile.pharmacy_id)
          .order("name", { ascending: true });
        // Products awaiting the owner's deletion decision are hidden from staff
        if ((profile?.role || "").toLowerCase().trim() !== "owner") medsQuery.is("deletion_requested_at" as any, null);
        const medsRes = await medsQuery;
        if (medsRes.data && medsRes.data.length > 0) {
          setMedicines(medsRes.data as Medicine[]);
        } else {
          setMedicines([]);
        }
      } catch (err) {
        console.warn("[Inventory] Fetch failed:", err);
        setMedicines([]);
      }

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
  }, [profile?.pharmacy_id, profile?.role, refreshToken]);

  // Auto-refresh when transfer is accepted or stock is modified elsewhere in the app
  useEffect(() => {
    const handleInventoryUpdate = () => {
      setRefreshToken((prev) => prev + 1);
    };
    window.addEventListener("inventory-updated", handleInventoryUpdate);
    return () => {
      window.removeEventListener("inventory-updated", handleInventoryUpdate);
    };
  }, []);

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

  // Selected location resolution
  const selectedLocation = isSalesman ? activeLocation.id : selectedLocationId;
  const isViewingAll = !isSalesman && selectedLocation === "all";

  // Filter local medicines with efficient grouping and branch-wise filtering
  const filteredMedicines = useMemo(() => {
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

    if (isViewingAll) {
      // 1. DATA GROUPING LOGIC (All Locations / Global):
      // - Do NOT render duplicate rows for the same medicine.
      // - Group inventory items by unique medicine_id (or unique medicine identity).
      // - Aggregate the stock: Calculate total stock by summing up quantities across all branches for that medicine.
      // - Render exactly ONE card per medicine in the list.
      const groupedMap = result.reduce((acc, item) => {
        const key = getMedicineIdentityKey(item);
        const existing = acc.get(key);

        if (!existing) {
          // Normalize initial stock_distribution
          let initialDist: StockDistributionItem[] = [];
          if (Array.isArray(item.stock_distribution) && item.stock_distribution.length > 0) {
            initialDist = item.stock_distribution.map((d) => ({
              location_id: d.location_id,
              qty: Number(d.qty) || 0,
            }));
          } else if (item.branch_id || item.location_id) {
            const loc = (item.branch_id || item.location_id)!;
            initialDist = [{ location_id: loc, qty: Number(item.stock_quantity) || 0 }];
          }

          const totalStock = initialDist.length > 0
            ? calculateTotalStock(initialDist, null)
            : Number(item.stock_quantity) || 0;

          acc.set(key, {
            ...item,
            stock_quantity: totalStock,
            stock_distribution: initialDist,
          });
        } else {
          // Merge multi-branch stock distribution
          const distMap = new Map<string, number>();

          // Existing distributions
          if (Array.isArray(existing.stock_distribution)) {
            for (const d of existing.stock_distribution) {
              if (d.location_id) {
                distMap.set(d.location_id, (distMap.get(d.location_id) || 0) + (Number(d.qty) || 0));
              }
            }
          }

          // Item's distributions or location stock
          if (Array.isArray(item.stock_distribution) && item.stock_distribution.length > 0) {
            for (const d of item.stock_distribution) {
              if (d.location_id) {
                distMap.set(d.location_id, (distMap.get(d.location_id) || 0) + (Number(d.qty) || 0));
              }
            }
          } else if (item.branch_id || item.location_id) {
            const loc = (item.branch_id || item.location_id)!;
            const q = Number(item.stock_quantity) || 0;
            distMap.set(loc, (distMap.get(loc) || 0) + q);
          }

          const mergedDist = Array.from(distMap.entries()).map(([location_id, qty]) => ({
            location_id,
            qty,
          }));

          const aggregatedStock = mergedDist.length > 0
            ? calculateTotalStock(mergedDist, null)
            : (existing.stock_quantity || 0) + (Number(item.stock_quantity) || 0);

          existing.stock_quantity = aggregatedStock;
          existing.stock_distribution = mergedDist;

          // Preserve non-empty fields
          if (!existing.company_name && item.company_name) existing.company_name = item.company_name;
          if (!existing.generic_name && item.generic_name) existing.generic_name = item.generic_name;
          if (!existing.price && item.price) existing.price = item.price;
          if (!existing.product_size && (item.product_size || item.strength)) {
            existing.product_size = item.product_size || item.strength;
          }
        }

        return acc;
      }, new Map<string, Medicine>());

      return Array.from(groupedMap.values());
    } else {
      // 2. DATA FILTERING LOGIC (Specific Branch selected):
      // - Strict branch isolation: A medicine row belongs strictly to ONE location_id.
      // - Display only medicines existing in that specific branch.
      // - Zero-Stock Visibility: Never auto-hide items with 0 stock.
      const targetFilterLoc =
        locations.find((l) => l.id === selectedLocation || l.code === selectedLocation) || {
          id: selectedLocation,
        };

      const targetId = (selectedLocation || "").trim().toLowerCase();
      const targetCode = targetFilterLoc.code?.trim().toLowerCase();

      // Strict branch filter: only include rows that belong explicitly to this branch
      const branchItems = result.filter((item: any) => {
        const itemBranch = (item.location_id || item.branch_id || "").trim().toLowerCase();
        return Boolean(itemBranch) && (itemBranch === targetId || (targetCode && itemBranch === targetCode));
      });

      // Group medicines by unique identity for the specific branch so no duplicate rows exist within a branch
      const branchGroupedMap = branchItems.reduce((acc, item: any) => {
        const key = getMedicineIdentityKey(item);
        const branchStock = Number(item.stock_quantity) || 0;
        const existing = acc.get(key);

        if (!existing) {
          acc.set(key, {
            ...item,
            branch_id: selectedLocation,
            location_id: selectedLocation,
            stock_quantity: branchStock,
          });
        } else {
          existing.stock_quantity = (existing.stock_quantity || 0) + branchStock;
        }

        return acc;
      }, new Map<string, Medicine>());

      return Array.from(branchGroupedMap.values());
    }
  }, [
    medicines,
    searchQuery,
    selectedCompanies,
    selectedLocation,
    isViewingAll,
    locations,
  ]);

  // Dual-section view is active whenever the user is filtering by company
  // or actively searching. Otherwise we show only the default inventory list.
  const isDualMode = selectedCompanies.size > 0 || !!searchQuery.trim();

  // Debounce the search input so we don't hit Supabase on every keystroke.
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);

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
      // Hyphen/space-insensitive search via RPC (e.g. "afenac" matches "A-Fenac").
      const { data, error } = await supabase.rpc("search_master_medicines", {
        _query: debouncedSearch || "",
        _companies: selectedCompanies.size ? Array.from(selectedCompanies) : null,
        _limit: 500,
      });
      if (cancelled || (window as any).__catalogReqId !== reqId) return;
      if (!error) setCatalog(data || []);
      setCatalogLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isDualMode, selectedCompanies, debouncedSearch]);

  // Filter catalog results (exclude items already present in the active branch's local inventory).
  // Filter catalog results (exclude items already present in the active branch's local inventory).
  // Uses localKeys mapped strictly over the active branch's filteredMedicines array (NOT the global medicines array).
  // This ensures that if Branch B owns a product, Branch A and Branch C can still see it under "FROM CATALOG".
  const filteredCatalog = useMemo(() => {
    if (!isDualMode) return [];
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
    const normalizeStrict = (s: string | null | undefined) =>
      (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Exact triple-key set from active branch's filteredMedicines
    const localKeys = new Set(
      filteredMedicines.map(
        (m) => `${norm(m.name)}|${norm(m.company_name)}|${norm(m.product_size)}`
      )
    );

    // 2. Normalized brand+strength composite set to match despite spacing/symbol differences
    const localCompositeKeys = new Set(
      filteredMedicines.map(
        (m) => `${normalizeStrict(m.name)}|${normalizeStrict(m.product_size)}`
      )
    );

    // 3. Fallback normalized full string (e.g. "Osartil 50" combined)
    const localCombinedStrings = new Set(
      filteredMedicines.map((m) =>
        normalizeStrict(`${m.name || ""}${m.product_size || ""}`)
      )
    );

    const result = catalog.filter((m) => {
      const exactKey = `${norm(m.brand_name)}|${norm(m.company)}|${norm(m.strength)}`;
      const compositeKey = `${normalizeStrict(m.brand_name)}|${normalizeStrict(m.strength)}`;
      const combinedString = normalizeStrict(`${m.brand_name || ""}${m.strength || ""}`);

      if (localKeys.has(exactKey)) return false;
      if (localCompositeKeys.has(compositeKey)) return false;
      if (combinedString && localCombinedStrings.has(combinedString)) return false;
      return true;
    });

    return result.sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [catalog, filteredMedicines, isDualMode]);

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

  const handleOpenSheetForInventory = (med: Medicine) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    const matchingMaster = (catalog || []).find(
      (m) => m.brand_name.trim().toLowerCase() === med.name.trim().toLowerCase()
    );
    const pps = Number(med.pcs_per_strip) || Number(matchingMaster?.pcs_per_strip) || 1;
    const spp = Number(med.strip_per_pack) || Number(matchingMaster?.strip_per_pack) || 1;
    const pBox = Math.max(1, pps * spp);

    const pricing = normalizePricing({
      rawPrice: med.price,
      pcsPerBox: pBox,
      masterUnitPrice: matchingMaster?.unit_price,
      productType: med.product_type || med.unit_format,
    });

    setSelectedSheetMed({
      id: med.id,
      medicine_id: med.medicine_id,
      name: med.name,
      company_name: med.company_name,
      product_type: med.product_type,
      unit_format: med.unit_format,
      product_size: med.product_size,
      generic_name: med.generic_name,
      price: pricing.unitPrice,
      unit_price: pricing.unitPrice,
      box_price: pricing.boxPrice,
      piece_price: pricing.unitPrice,
      purchase_price_box: pricing.purchasePriceBox,
      purchase_price_unit: pricing.purchasePriceUnit,
      masterUnitPrice: matchingMaster?.unit_price ?? null,
      stock_quantity: med.stock_quantity,
      stock_distribution: med.stock_distribution,
      location_id: med.location_id,
      branch_id: med.branch_id,
      stock_alert: med.stock_alert,
      pcs_per_strip: med.pcs_per_strip || (pps > 1 ? pps : undefined),
      strip_per_pack: med.strip_per_pack || (spp > 1 ? spp : undefined),
      box_size: med.box_size,
      pack_size: med.pack_size,
      expiry_date: med.expiry_date,
      isFromCatalog: false,
    });
    setSheetOpen(true);
  };

  const handleOpenSheetForCatalog = (med: MasterMedicine) => {
    const existing = medicines.find(
      (m) =>
        m.name.trim().toLowerCase() === med.brand_name.trim().toLowerCase() &&
        (med.company ? (m.company_name || "").trim().toLowerCase() === med.company.trim().toLowerCase() : true)
    );

    const hasMasterInts =
      typeof med.pcs_per_strip === "number" || typeof med.strip_per_pack === "number";
    const { pcs_per_strip: catalogPcsPerStrip, strip_per_pack: catalogStripPerPack } = hasMasterInts
      ? { pcs_per_strip: med.pcs_per_strip, strip_per_pack: med.strip_per_pack }
      : classifyCatalogPack({ pack_size: med.pack_size, box_size: med.box_size });

    const pps = Number(existing?.pcs_per_strip) || Number(catalogPcsPerStrip) || Number(med.pcs_per_strip) || 1;
    const spp = Number(existing?.strip_per_pack) || Number(catalogStripPerPack) || Number(med.strip_per_pack) || 1;
    const pBox = Math.max(1, pps * spp);

    const pricing = normalizePricing({
      rawPrice: existing?.price ?? med.unit_price,
      pcsPerBox: pBox,
      masterUnitPrice: med.unit_price,
      productType: toFunctionalType(med.format),
    });

    setSelectedSheetMed({
      id: existing?.id,
      masterId: med.id,
      name: med.brand_name,
      company_name: med.company,
      product_type: toFunctionalType(med.format),
      unit_format: med.format,
      product_size: med.strength,
      strength: med.strength,
      generic_name: med.generic_name,
      price: pricing.unitPrice,
      unit_price: pricing.unitPrice,
      box_price: pricing.boxPrice,
      piece_price: pricing.unitPrice,
      purchase_price_box: pricing.purchasePriceBox,
      purchase_price_unit: pricing.purchasePriceUnit,
      masterUnitPrice: med.unit_price ?? null,
      stock_quantity: existing?.stock_quantity ?? 0,
      stock_alert: existing?.stock_alert ?? 0,
      pcs_per_strip: existing?.pcs_per_strip ?? catalogPcsPerStrip,
      strip_per_pack: existing?.strip_per_pack ?? catalogStripPerPack,
      box_size: existing?.box_size ?? med.box_size,
      pack_size: med.pack_size,
      expiry_date: existing?.expiry_date,
      isFromCatalog: !existing,
    });
    setSheetOpen(true);
  };

  const handleSaveFromSheet = async (payload: InventoryItemPayload) => {
    if (!profile?.pharmacy_id) {
      toast.error("No pharmacy linked");
      return;
    }

    const isAlreadyPersisted = Boolean((payload as any)._alreadyPersisted);

    // Determine target branch: if specific branch is selected, assign to it; otherwise active location
    const targetLocId =
      payload.branch_id ||
      payload.location_id ||
      (selectedLocationId !== "all" ? selectedLocationId : activeLocation?.id || "");
    const targetLoc = locations.find((l) => l.id === targetLocId || l.code === targetLocId);

    const addedPieces =
      typeof payload.totalAddedPieces === "number"
        ? payload.totalAddedPieces
        : payload.totalQtyPieces + (payload.freeQty || 0);

    const resolvedUnitPrice =
      payload.unitPrice > 0
        ? payload.unitPrice
        : payload.pcsPerBox > 1
        ? Number((payload.salePrice / payload.pcsPerBox).toFixed(4))
        : payload.salePrice;

    const minAlert = payload.minQtyAlert ?? payload.minQty;

    // 1. If stock inward was already persisted by InventoryUpdateModal with strict branch isolation:
    // DO NOT execute secondary database mutations that risk modifying Main Branch!
    // Simply synchronize local UI state to reflect the branch credit.
    if (isAlreadyPersisted) {
      await fetchData();
      return;
    }

    let targetId = payload.medicineId;
    let existingMed = targetId ? medicines.find((m) => m.id === targetId) : undefined;

    if (!existingMed && targetLocId) {
      const { data: found } = await supabase
        .from("medicines")
        .select("*")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("location_id", targetLocId)
        .ilike("name", payload.name)
        .maybeSingle();
      if (found) {
        existingMed = found as Medicine;
        targetId = found.id;
      }
    }

    if (existingMed && targetId) {
      const currentStock = existingMed.stock_quantity || 0;
      const newStock = currentStock + addedPieces;
      const dbPayload: any = {
        stock_quantity: newStock,
      };
      if (resolvedUnitPrice > 0) dbPayload.price = resolvedUnitPrice;
      if (typeof minAlert === "number" && minAlert >= 0) dbPayload.stock_alert = minAlert;
      if (payload.expiryDate) dbPayload.expiry_date = payload.expiryDate;
      if (payload.pcsPerBox > 1) {
        dbPayload.pcs_per_strip = payload.pcsPerBox;
        dbPayload.strip_per_pack = 1;
      }
      if (targetLocId) {
        dbPayload.location_id = targetLocId;
      }

      try {
        await supabase
          .from("medicines")
          .update(dbPayload)
          .eq("id", targetId);
      } catch (err) {
        console.warn("[Inventory] Database update note:", err);
      }

      await fetchData();
    } else {
      const functionalType = toFunctionalType(payload.unitFormat);
      const productTypeBucket =
        functionalType === "Other" && payload.unitFormat ? payload.unitFormat : functionalType;
      const finalLocId =
        payload.branch_id ||
        payload.location_id ||
        (selectedLocationId !== "all" ? selectedLocationId : activeLocation?.id || "");

      const insertPayload: any = {
        pharmacy_id: profile.pharmacy_id,
        name: payload.name.trim(),
        company_name: payload.companyName || null,
        product_type: productTypeBucket || "Tablet",
        unit_format: payload.unitFormat || null,
        product_size: payload.productSize || null,
        price: resolvedUnitPrice > 0 ? resolvedUnitPrice : null,
        stock_quantity: addedPieces,
        stock_alert: payload.minQtyAlert ?? payload.minQty ?? 0,
        pcs_per_strip: payload.pcsPerBox > 1 ? payload.pcsPerBox : 1,
        strip_per_pack: 1,
        generic_name: payload.genericName || null,
        expiry_date: payload.expiryDate || null,
        location_id: finalLocId || null,
      };

      try {
        const { error: insertErr } = await supabase
          .from("medicines")
          .insert(insertPayload);
        if (insertErr) throw insertErr;
      } catch (insertErr: any) {
        toast.error("Failed to add product: " + (insertErr.message || "Error"));
        throw insertErr;
      }

      toast.success(`${payload.name} added to inventory with ${addedPieces} units!`);
      await fetchData();
    }
  };

  const handleCardClick = (id: string) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    const med = medicines.find((m) => m.id === id);
    if (med) {
      handleOpenSheetForInventory(med);
      return;
    }
    if (!searchOpen) return;
    setExpandedId((prev) => (prev === id ? null : id));
    setExpandedCatalogId(null);
    setCatalogQty("");
  };

  const handleCatalogCardClick = (id: string) => {
    const med = catalog.find((c) => c.id === id);
    if (med) {
      handleOpenSheetForCatalog(med);
      return;
    }
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
    if (!Number.isFinite(addedPieces) || addedPieces <= 0) {
      toast.error("Enter a positive quantity to add");
      return;
    }
    setSavingId(med.id);
    const newStock = getCalculatedStock(med);
    if (!Number.isFinite(newStock) || newStock < 0) {
      toast.error("Invalid stock value");
      setSavingId(null);
      return;
    }
    const { error } = await supabase.from("medicines").update({ stock_quantity: newStock }).eq("id", med.id);
    if (error) {
      console.error("[Inventory] stock update failed:", error);
      toast.error("Failed to update stock: " + (error.message || "Unknown error"));
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
    const hasMasterInts =
      typeof med.pcs_per_strip === "number" || typeof med.strip_per_pack === "number";
    const { pcs_per_strip: pcsPerStrip, strip_per_pack: stripPerPack } = hasMasterInts
      ? { pcs_per_strip: med.pcs_per_strip, strip_per_pack: med.strip_per_pack }
      : classifyCatalogPack({ pack_size: med.pack_size, box_size: med.box_size });
    const rawQty = parseInt(catalogQty, 10) || 0;
    const functionalType = toFunctionalType(med.format);
    // Keep verbatim format for unmappable types so the pharmacy still gets a
    // sensible custom bucket (e.g. "Eye Drop") in the product-type dropdown.
    const productTypeBucket =
      functionalType === "Other" && med.format ? med.format : functionalType;
    const isMultiUnit = !isSingleUnit({ pcs_per_strip: pcsPerStrip, strip_per_pack: stripPerPack });
    const stockQty = isMultiUnit ? boxesToPieces(rawQty, stripPerPack, pcsPerStrip) : rawQty;
    const finalLocId = (selectedLocationId !== "all" ? selectedLocationId : activeLocation?.id || "") || null;

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
      pack_size: med.pack_size,
      box_size: med.box_size,
      generic_name: med.generic_name,
      strength: med.strength,
      format: med.format,
      location_id: finalLocId,
      branch_id: finalLocId,
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

  const isOwner = (profile?.role || "").toLowerCase().trim() === "owner";

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const med = medicines.find((m) => m.id === deleteConfirmId);
    const { data, error } = await supabase.rpc("request_medicine_deletion" as any, {
      _medicine_id: deleteConfirmId,
      _reason: null,
    });
    if (error) {
      reportReadOnlyBlock(error.message, "medicines");
      toast.error(error.message.replace(/^[A-Z_]+:\s*/, "") || "Failed to delete product");
    } else if ((data as any)?.status === "pending") {
      toast.success("Deletion request sent to the shop owner");
      setMedicines((prev) => prev.filter((m) => m.id !== deleteConfirmId));
    } else {
      toast.success(`${med?.name || "Product"} deleted`);
      setMedicines((prev) => prev.filter((m) => m.id !== deleteConfirmId));
    }
    setDeleteConfirmId(null);
    setLongPressId(null);
  };


  const longPressMed = longPressId ? medicines.find((m) => m.id === longPressId) : null;

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-50 pb-6">
      {/* 1. Header & Title Update */}
      <div className="px-5 pt-4 pb-2">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Inventory</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage, track and transfer stock</p>
      </div>

      {/* 2. Permanent Search Bar */}
      <div className="px-5 pb-1">
        <div className="relative flex items-center w-full rounded-2xl border border-slate-200 bg-white shadow-2xs focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-100/60 transition-all">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search medicine, generic, or brand..."
            className="w-full h-11 pl-10 pr-12 rounded-2xl bg-transparent border-0 text-sm text-slate-900 placeholder:text-slate-400 shadow-none focus-visible:ring-0 focus-visible:border-0 transition-all"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={cn(
                "relative p-1.5 rounded-lg transition-colors cursor-pointer",
                selectedCompanies.size > 0
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
              )}
              title="Filter by Company"
            >
              <SlidersHorizontal size={17} />
              {selectedCompanies.size > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-blue-600 text-[9px] font-bold text-white flex items-center justify-center shadow-xs">
                  {selectedCompanies.size}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Horizontal Location & Status Pills */}
      <div className="px-5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {!isSalesman ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedLocationId("all")}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs transition-all whitespace-nowrap shrink-0",
                  selectedLocationId === "all"
                    ? "bg-blue-600 text-white font-medium shadow-xs shadow-blue-500/20"
                    : "bg-blue-50/60 text-slate-600 hover:bg-blue-100/70 hover:text-blue-700 border border-blue-100/50"
                )}
              >
                All Locations
              </button>

              {locations.map((loc) => {
                const isActive = selectedLocationId === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => setSelectedLocationId(loc.id)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-full text-xs transition-all whitespace-nowrap shrink-0",
                      isActive
                        ? "bg-blue-600 text-white font-medium shadow-xs shadow-blue-500/20"
                        : "bg-blue-50/60 text-slate-600 hover:bg-blue-100/70 hover:text-blue-700 border border-blue-100/50"
                    )}
                  >
                    {loc.name}
                  </button>
                );
              })}
            </>
          ) : (
            <div className="px-3.5 py-1.5 rounded-full text-xs bg-blue-600 text-white font-medium shadow-xs shadow-blue-500/20 whitespace-nowrap shrink-0">
              {activeLocation.name || "Assigned Branch"}
            </div>
          )}

          {selectedCompanies.size > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-full text-xs bg-red-50 text-[#CC3333] hover:bg-red-100 font-medium whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors border border-red-200"
            >
              <span>{selectedCompanies.size} company filter{selectedCompanies.size > 1 ? "s" : ""}</span>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Medicine List */}
      <div className="px-5 space-y-2 pt-2 pb-24">
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

                  const isViewingAll = !isSalesman && selectedLocationId === "all";
                  const targetFilterLoc = isSalesman
                    ? activeLocation
                    : selectedLocationId !== "all"
                    ? locations.find((l) => l.id === selectedLocationId)
                    : null;

                  const displayedStock = isViewingAll
                    ? calculateTotalStock(med.stock_distribution, med.stock_quantity)
                    : getStockForLocation(med, targetFilterLoc || activeLocation, locations);

                  const locBreakdown = getLocationBreakdown(med, locations);

                  const totalStock = displayedStock;
                  const { boxes, strips, pcs } = totalPiecesToTriUnitObj(
                    totalStock,
                    med.strip_per_pack,
                    med.pcs_per_strip
                  );
                  const hasPackaging =
                    (Number(med.strip_per_pack) > 1) || (Number(med.pcs_per_strip) > 1);

                  const stockSummary = hasPackaging
                    ? `${boxes}.${strips}.${pcs}`
                    : "0.0.0";
                  const stockDisplay = `${stockSummary} / ${totalStock} Pcs`;

                  const rawDosageForm = med.unit_format || med.product_type || "";
                  const dosageForm = formatDosageForm(rawDosageForm);
                  const genericAndForm = [med.generic_name, dosageForm].filter(Boolean).join(" · ") || "—";
                  const formattedPrice = med.price != null
                    ? Number(med.price).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                    : "0";

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
                      className={cn(
                        "bg-white rounded-xl p-3 border border-slate-150 hover:border-blue-200 shadow-2xs hover:shadow-xs transition-all active:scale-[0.995] cursor-pointer mb-2 flex items-start gap-2.5 select-none",
                        pressingId === med.id && "scale-95",
                        isExpanded && "ring-2 ring-blue-500"
                      )}
                    >
                      {/* Left Icon: Soft rounded container matching dashboard stat cards */}
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Pill className="w-5 h-5 stroke-[2] text-blue-600" />
                      </div>

                      {/* 3-Line Content Structure */}
                      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                        {/* LINE 1: Header & Branch Availability Dots */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-baseline gap-1.5 flex-wrap min-w-0 flex-1">
                            <span
                              className="font-semibold text-slate-900 text-[13px] leading-tight"
                              title={med.name}
                            >
                              {med.name}
                            </span>
                            {med.product_size && (
                              <span className="font-medium text-slate-600 text-xs shrink-0 whitespace-nowrap">
                                {med.product_size}
                              </span>
                            )}
                          </div>

                          {/* Branch availability color dots */}
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            {locBreakdown.map((item, idx) => {
                              const branch = item.location;
                              const locIdx = locations.findIndex((l) => l.id === branch.id);
                              const dotColor =
                                (branch as any).color ||
                                BRANCH_COLORS[(locIdx >= 0 ? locIdx : idx) % BRANCH_COLORS.length] ||
                                "#10b981";
                              return (
                                <span
                                  key={branch.id}
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: dotColor }}
                                  title={`${branch.name}: ${item.qty} pcs`}
                                />
                              );
                            })}
                          </div>
                        </div>

                        {/* LINE 2: Generic & Dosage Form + Price */}
                        <div className="flex justify-between items-center gap-2">
                          <span
                            className="text-xs text-slate-500 font-normal truncate max-w-[210px]"
                            title={genericAndForm !== "—" ? genericAndForm : undefined}
                          >
                            {genericAndForm}
                          </span>
                          <span className="text-sm font-bold text-slate-900 tracking-tight tabular-nums shrink-0">
                            ৳{formattedPrice}
                          </span>
                        </div>

                        {/* LINE 3: Company & Stock Breakdown */}
                        <div className="flex justify-between items-center gap-2">
                          <span
                            className="text-[11px] font-medium text-slate-400 truncate max-w-[190px]"
                            title={med.company_name || undefined}
                          >
                            {med.company_name || "—"}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-semibold text-slate-700 tracking-tight tabular-nums shrink-0",
                              displayedStock === 0 && "text-rose-600"
                            )}
                          >
                            {stockDisplay}
                          </span>
                        </div>

                        {/* Expandable Quick Stock Adjuster (when active via long-press) */}
                        {isExpanded && (
                          <div
                            className="pt-2 mt-1 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              const rawInput = unitInputs[med.id] || "";
                              const { addedPieces, isTriple } = parseStockInput(rawInput, med);
                              const label = isTriple ? "B.S.P" : looksSingleUnit(med) ? "Qty" : "Box";
                              return (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
                                  <Input
                                    autoFocus
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9.]*"
                                    placeholder="0.0.0"
                                    value={rawInput}
                                    onChange={(e) => {
                                      let cleaned = e.target.value.replace(/[^0-9.]/g, "").replace(/\.{2,}/g, ".");
                                      const parts = cleaned.split(".");
                                      if (parts.length > 3) {
                                        cleaned = parts.slice(0, 3).join(".") + parts.slice(3).join("");
                                      }
                                      setUnitInputs((prev) => ({ ...prev, [med.id]: cleaned }));
                                    }}
                                    className="w-24 h-7 text-center rounded-lg border border-border bg-background text-xs font-semibold px-1"
                                  />
                                  <button
                                    onClick={() => handleConfirmStock(med)}
                                    disabled={addedPieces <= 0 || savingId === med.id}
                                    className="p-1 rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-colors"
                                  >
                                    <Check size={14} />
                                  </button>
                                </div>
                              );
                            })()}
                            <div className="flex items-center gap-3 text-xs font-medium bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">
                              <span className="text-slate-900 font-semibold">৳ {med.price ?? "—"}</span>
                              <span className="text-slate-400">
                                Pre: <TriUnitDisplay totalPcs={displayedStock} stripPerPack={med.strip_per_pack} pcsPerStrip={med.pcs_per_strip} productType={med.product_type} />
                              </span>
                              <span className="text-emerald-600 font-semibold">
                                Current: <TriUnitDisplay totalPcs={calculatedStock} stripPerPack={med.strip_per_pack} pcsPerStrip={med.pcs_per_strip} productType={med.product_type} />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
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
                      const { pcs_per_strip: catalogPcsPerStrip, strip_per_pack: catalogStripPerPack } =
                        classifyCatalogPack({ pack_size: med.pack_size, box_size: med.box_size });
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
            <p className="text-sm font-bold text-foreground text-center mb-1">
              {isOwner ? "Delete Product?" : "Request Deletion?"}
            </p>
            <p className="text-xs text-muted-foreground text-center mb-5">
              {isOwner ? (
                <>Are you sure you want to delete <span className="font-semibold text-foreground">{longPressMed.name}</span>? This action cannot be undone.</>
              ) : (
                <><span className="font-semibold text-foreground">{longPressMed.name}</span> will be hidden and sent to the shop owner for approval.</>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteConfirmId(null); setLongPressId(null); }} className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors">
                {isOwner ? "Delete" : "Request"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 1-Step Inventory Update Bottom Sheet Modal */}
      <InventoryUpdateModal
        isOpen={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSelectedSheetMed(null);
        }}
        medicine={selectedSheetMed}
        selectedLocation={selectedLocationId}
        selectedLocationId={selectedLocationId}
        onSaveInventory={handleSaveFromSheet}
        onRemove={
          selectedSheetMed?.id
            ? () => {
                const medId = selectedSheetMed.id!;
                setSheetOpen(false);
                setSelectedSheetMed(null);
                setLongPressId(medId);
                setDeleteConfirmId(medId);
              }
            : undefined
        }
      />

      {/* Modern Floating Action Button (FAB) */}
      <button
        id="inventory-fab-add-product"
        type="button"
        onClick={() => navigate("/add-product")}
        className="fixed bottom-24 right-5 z-40 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/30 hover:from-blue-700 hover:to-blue-600 active:scale-95 transition-all px-4 py-3.5 rounded-full flex items-center gap-2 font-medium text-sm cursor-pointer select-none"
        aria-label="Add Product"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        <span>Add Product</span>
      </button>
    </div>
  );
};

export default Inventory;
