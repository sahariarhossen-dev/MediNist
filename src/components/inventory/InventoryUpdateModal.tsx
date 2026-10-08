import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Calendar as CalendarIcon,
  Loader2,
  Calculator as CalculatorIcon,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Lock,
  Layers,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { QuickCalculator } from "./QuickCalculator";
import { normalizePricing, roundMoney, roundUnitPrice, resolvePcsPerBox } from "@/lib/pricingUtils";
import { useAuth } from "@/contexts/AuthContext";
import { notifyPriceUpdate } from "@/lib/priceUpdateNotifications";
import { useLocationStore } from "@/contexts/LocationContext";
import { StockDistributionItem } from "@/types/inventory";
import {
  calculateTotalStock,
  getStockForLocation,
  getLocationBreakdown,
} from "@/lib/multiLocationStock";
import { fetchLiveMedicineDistribution } from "@/lib/stockTransferService";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface MedicineSelectionItem {
  id?: string; // Existing inventory medicine ID
  masterId?: string; // Master catalog ID
  name: string;
  company_name?: string | null;
  product_type?: string | null;
  unit_format?: string | null;
  product_size?: string | null;
  strength?: string | null;
  generic_name?: string | null;
  price?: number | null; // Sale price / MRP (unit or box)
  unit_price?: number | null; // Explicit selling price per unit / piece
  box_price?: number | null; // Explicit selling price per full box
  piece_price?: number | null; // Explicit piece price
  purchase_price_box?: number | null; // Purchase price per box (BTP+VAT)
  purchase_price_unit?: number | null; // Purchase price per unit
  masterUnitPrice?: number | null; // Catalog reference unit price
  stock_quantity?: number | null; // Existing stock in pieces
  stock_distribution?: StockDistributionItem[];
  location_id?: string | null;
  branch_id?: string | null;
  medicine_id?: string | null;
  stock_alert?: number | null;
  pcs_per_strip?: number | null;
  strip_per_pack?: number | null;
  box_size?: string | null;
  pack_size?: string | null;
  expiry_date?: string | null;
  isFromCatalog?: boolean;
}

export interface InventoryItemPayload {
  medicineId: string;
  masterMedicineId?: string;
  name: string;
  companyName: string | null;
  productType: string | null;
  unitFormat: string | null;
  productSize: string | null;
  genericName: string | null;
  pcsPerBox: number;
  boxNo: number;
  totalQtyPieces: number;
  minQtyAlert: number;

  // Location / Branch assignment
  branch_id?: string;
  location_id?: string;

  // Normalized clear pricing fields
  boxPrice: number; // Selling price per box (Box MRP)
  unitPrice: number; // Selling price per piece (Unit MRP)
  purchasePriceBox: number; // Purchase price per box including VAT (BTP+VAT)
  purchasePriceUnit: number; // Purchase price per piece including VAT

  // Backward-compatible fields
  salePrice: number; // Box MRP
  btpPrice: number; // Purchase price per box
  freeQty: number;
  expiryDate: string; // "MM/YYYY"
  totalPurchaseCost: number; // Box No * (BTP+VAT)
  batchNumber?: string;

  // Backward-compatible fields
  minQty?: number;
  btpWithVat?: number;
  totalAddedPieces?: number;
  totalBoxesQty?: number;
}

export type InventoryUpdatePayload = InventoryItemPayload;

interface InventoryUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: MedicineSelectionItem | null;
  selectedLocation?: string;
  selectedLocationId?: string;
  onSaveInventory?: (payload: InventoryItemPayload) => Promise<boolean | void>;
  onSave?: (payload: InventoryItemPayload) => Promise<boolean | void>;
  onRemove?: () => void;
  canEditPricing?: boolean;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const InventoryUpdateModal: React.FC<InventoryUpdateModalProps> = ({
  isOpen,
  onClose,
  medicine,
  selectedLocation,
  selectedLocationId,
  onSaveInventory,
  onSave,
  onRemove,
  canEditPricing,
}) => {
  // Role & Permission Identification
  const { user, profile } = useAuth();
  const { locations, activeLocation, currentUserRole } = useLocationStore();
  const effectiveRole = (currentUserRole || profile?.role || "").toLowerCase().trim();
  const isSalesman = effectiveRole === "salesman";
  const isOwnerOrManager = effectiveRole === "owner" || effectiveRole === "manager";
  const canEditPrice = canEditPricing !== undefined ? canEditPricing : isOwnerOrManager;

  // Query client for TanStack Query cache invalidation
  const queryClient = useQueryClient();

  // Selected branch resolution
  const currentSelectedLoc =
    (selectedLocation !== undefined ? selectedLocation : selectedLocationId) ||
    (isSalesman ? activeLocation?.id : "all");
  const isAllLocations = !isSalesman && currentSelectedLoc === "all";

  const selectedBranch = !isAllLocations
    ? locations.find((l) => l.id === currentSelectedLoc || l.code === currentSelectedLoc) || activeLocation
    : null;

  // Left Column Inputs (Order Inputs)
  const [boxNo, setBoxNo] = useState<string>("1");
  const [pcsPerBox, setPcsPerBox] = useState<string>("1");
  const [minQtyAlert, setMinQtyAlert] = useState<string>("0");
  const [expiryDate, setExpiryDate] = useState<string>(""); // MM/YYYY

  // Right Column Inputs & Tools (Price & Tools)
  const [btpPrice, setBtpPrice] = useState<string>("");
  const [salePrice, setSalePrice] = useState<string>(""); // Box MRP
  const [freeQty, setFreeQty] = useState<string>("");
  const [batchNo, setBatchNo] = useState<string>("");

  // Tracking initial prices for price update notification
  const initialBoxPriceRef = useRef<number>(0);
  const initialUnitPriceRef = useRef<number>(0);
  const initialBtpPriceRef = useRef<number>(0);

  // Tracking manual overrides
  const [unitMrpTracked, setUnitMrpTracked] = useState<number>(0);
  const [isSaleManuallyEdited, setIsSaleManuallyEdited] = useState<boolean>(false);
  const [isBtpManuallyEdited, setIsBtpManuallyEdited] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // Custom Month-Year Expiry Dialog State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(2026);
  const [pickerMonthIndex, setPickerMonthIndex] = useState<number>(new Date().getMonth());

  // Quick Calculator State
  const [showCalculator, setShowCalculator] = useState(false);

  const boxNoInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Prevent background body scrolling when modal is active
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  // Smooth scroll container focus tracking (OS Pharma effect: no screen squishing/jumping)
  useEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target.getAttribute("role") === "button"
      ) {
        window.setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
    };

    container.addEventListener("focusin", handleFocusIn);
    return () => {
      container.removeEventListener("focusin", handleFocusIn);
    };
  }, [isOpen]);

  // Prefill & Initialize whenever medicine changes or modal opens
  useEffect(() => {
    if (!medicine || !isOpen) return;

    // 1. Packaging: Pcs/Box
    const pps = Number(medicine.pcs_per_strip) || 1;
    const spp = Number(medicine.strip_per_pack) || 1;
    const initialPackaging = pps * spp > 1 ? pps * spp : 1;
    setPcsPerBox(String(initialPackaging));

    // 2. Default Box No = 1
    setBoxNo("1");

    // 3. MIN QTY
    setMinQtyAlert(medicine.stock_alert != null ? String(medicine.stock_alert) : "0");

    // 4. Free QTY & Batch
    setFreeQty("");
    setBatchNo("");

    // 5. Pricing Logic:
    // Normalize prices to prevent double multiplication bugs (e.g. box_price * pcs_per_box)
    const pricing = normalizePricing({
      rawPrice: medicine.price,
      pcsPerBox: initialPackaging,
      masterUnitPrice: medicine.masterUnitPrice,
      explicitUnitPrice: medicine.unit_price ?? medicine.piece_price,
      explicitBoxPrice: medicine.box_price,
      explicitPurchasePriceBox: medicine.purchase_price_box,
      productType: medicine.product_type || medicine.unit_format,
    });

    setUnitMrpTracked(pricing.unitPrice);
    setIsSaleManuallyEdited(false);
    setIsBtpManuallyEdited(false);

    // Save baseline prices for price update notification comparisons
    initialBoxPriceRef.current = pricing.boxPrice;
    initialUnitPriceRef.current = pricing.unitPrice;
    initialBtpPriceRef.current = pricing.purchasePriceBox;

    if (pricing.boxPrice > 0) {
      setSalePrice(pricing.boxPrice.toFixed(2));
      setBtpPrice(pricing.purchasePriceBox.toFixed(2));
    } else {
      setSalePrice("");
      setBtpPrice("");
    }

    // 6. Expiry Date: format to MM/YYYY
    if (medicine.expiry_date) {
      const parts = medicine.expiry_date.split("-");
      if (parts.length >= 2) {
        if (parts[0].length === 4) {
          // YYYY-MM -> MM/YYYY
          setExpiryDate(`${parts[1].padStart(2, "0")}/${parts[0]}`);
        } else {
          setExpiryDate(medicine.expiry_date);
        }
      } else {
        setExpiryDate(medicine.expiry_date);
      }
    } else {
      setExpiryDate("");
    }

    // Auto-focus Box No and highlight text on open
    const timer = setTimeout(() => {
      if (boxNoInputRef.current) {
        boxNoInputRef.current.focus();
        boxNoInputRef.current.select();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [medicine, isOpen]);

  // Handle Pcs/Box Change
  const handlePcsPerBoxChange = (val: string) => {
    setPcsPerBox(val);
    const newPcs = Number(val);
    if (!Number.isFinite(newPcs) || newPcs <= 0) return;

    if (!isSaleManuallyEdited && unitMrpTracked > 0) {
      const newBoxMrp = unitMrpTracked * newPcs;
      setSalePrice(newBoxMrp.toFixed(2));
      if (!isBtpManuallyEdited) {
        setBtpPrice((newBoxMrp * 0.88).toFixed(2));
      }
    } else if (isSaleManuallyEdited) {
      // If box sale price was entered manually, re-calculate tracked unit MRP
      const currentBoxMrp = Number(salePrice) || 0;
      if (currentBoxMrp > 0) {
        setUnitMrpTracked(Number((currentBoxMrp / newPcs).toFixed(4)));
      }
    }
  };

  // Handle Pricing Field Tapped by Restricted User
  const handlePricingFieldClick = () => {
    if (!canEditPrice) {
      toast.info("Only Owner or Manager can edit pricing", {
        id: "rbac-pricing-info",
        duration: 3000,
      });
    }
  };

  // Handle MRP / Sale Change (Box MRP)
  const handleSalePriceChange = (val: string) => {
    if (!canEditPrice) return;
    setSalePrice(val);
    setIsSaleManuallyEdited(true);
    const num = Number(val);
    const pBox = Math.max(1, Number(pcsPerBox) || 1);
    if (Number.isFinite(num) && num > 0) {
      setUnitMrpTracked(pBox > 1 ? Number((num / pBox).toFixed(4)) : num);
      if (!isBtpManuallyEdited) {
        setBtpPrice((num * 0.88).toFixed(2));
      }
    } else {
      setUnitMrpTracked(0);
      if (!isBtpManuallyEdited) {
        setBtpPrice("");
      }
    }
  };

  // Handle BTP+VAT manual change
  const handleBtpPriceChange = (val: string) => {
    if (!canEditPrice) return;
    setBtpPrice(val);
    setIsBtpManuallyEdited(true);
  };

  // Step 3: Calculation Rules via useMemo
  // Total QTY (T/QTY) = Number(boxNo || 0) * Number(pcsPerBox || 1)
  const totalQtyPieces = useMemo(() => {
    const b = Number(boxNo) || 0;
    const p = Number(pcsPerBox) || 1;
    return b * p;
  }, [boxNo, pcsPerBox]);

  // Total Price Display = (Number(boxNo || 0) * Number(btpPrice || 0)).toFixed(2)
  const totalPriceDisplay = useMemo(() => {
    const b = Number(boxNo) || 0;
    const btp = Number(btpPrice) || 0;
    return (b * btp).toFixed(2);
  }, [boxNo, btpPrice]);

  // Live multi-location distribution state fetched from Supabase
  const [liveBreakdown, setLiveBreakdown] = useState<Array<{ location: any; qty: number; percent: number }>>([]);
  const [liveTotalPieces, setLiveTotalPieces] = useState<number | null>(null);
  const [distributionRefreshKey, setDistributionRefreshKey] = useState(0);

  // Internal reactive branch stock state to ensure immediate UI update
  const [currentBranchStock, setCurrentBranchStock] = useState<number | null>(null);

  // Synchronize internal branch stock whenever modal opens or medicine / location changes
  useEffect(() => {
    if (isOpen && medicine) {
      const targetLoc = selectedBranch || activeLocation;
      const initialStock = getStockForLocation(medicine, targetLoc, locations);
      setCurrentBranchStock(initialStock);
    } else if (!isOpen) {
      setCurrentBranchStock(null);
    }
  }, [isOpen, medicine, selectedBranch, activeLocation, locations]);

  // Re-query live distribution on inventory-updated window event
  useEffect(() => {
    const handleInventoryUpdated = () => {
      setDistributionRefreshKey((prev) => prev + 1);
    };
    window.addEventListener("inventory-updated", handleInventoryUpdated);
    return () => {
      window.removeEventListener("inventory-updated", handleInventoryUpdated);
    };
  }, []);

  // Fetch live breakdown across all locations when modal opens or inventory updates
  useEffect(() => {
    let isCancelled = false;
    if (isOpen && medicine?.name && profile?.pharmacy_id && locations.length > 0) {
      fetchLiveMedicineDistribution(
        profile.pharmacy_id,
        medicine.name,
        locations,
        medicine.stock_distribution,
        medicine.stock_quantity ?? undefined
      ).then((res) => {
        if (!isCancelled) {
          setLiveBreakdown(res.breakdown);
          setLiveTotalPieces(res.totalPieces);
          const targetLoc = selectedBranch || activeLocation;
          if (targetLoc) {
            const entry = res.breakdown.find(
              (b) =>
                b.location.id === targetLoc.id ||
                (targetLoc.code && b.location.code === targetLoc.code) ||
                (targetLoc.name && b.location.name?.toLowerCase() === targetLoc.name?.toLowerCase())
            );
            if (entry !== undefined) {
              setCurrentBranchStock(entry.qty);
            }
          }
        }
      }).catch((err) => {
        console.warn("[InventoryUpdateModal] Error fetching live distribution:", err);
      });
    } else {
      setLiveBreakdown([]);
      setLiveTotalPieces(null);
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, medicine?.name, medicine?.stock_quantity, medicine?.stock_distribution, profile?.pharmacy_id, locations, selectedBranch, activeLocation, distributionRefreshKey]);

  // Multi-location Stock Calculations
  const boxUnits = useMemo(() => {
    const pps = Number(medicine?.pcs_per_strip) || 1;
    const spp = Number(medicine?.strip_per_pack) || 1;
    return Math.max(1, pps * spp);
  }, [medicine?.pcs_per_strip, medicine?.strip_per_pack]);

  // If specific branch or salesman: strictly selected branch / activeLocation stock
  const branchStockPieces = useMemo(() => {
    if (currentBranchStock !== null) return currentBranchStock;
    if (!medicine) return 0;
    const targetLoc = selectedBranch || activeLocation;
    if (liveBreakdown.length > 0) {
      const entry = liveBreakdown.find(
        (b) =>
          (targetLoc?.id && (b.location.id === targetLoc.id || b.location.code === targetLoc.id)) ||
          (targetLoc?.code && (b.location.code === targetLoc.code || b.location.id === targetLoc.code)) ||
          (targetLoc?.name && b.location.name?.toLowerCase() === targetLoc.name?.toLowerCase())
      );
      if (entry !== undefined) return entry.qty;
    }
    return getStockForLocation(medicine, targetLoc, locations);
  }, [currentBranchStock, medicine, liveBreakdown, selectedBranch, activeLocation, locations]);

  const branchStockBoxes = useMemo(() => {
    return (branchStockPieces / boxUnits).toFixed(1);
  }, [branchStockPieces, boxUnits]);

  // Backward compatibility alias for salesman
  const salesmanStockPieces = branchStockPieces;
  const salesmanStockBoxes = branchStockBoxes;

  // If owner/manager: total stock & breakdown across locations
  const totalStockPieces = useMemo(() => {
    if (liveTotalPieces !== null) return liveTotalPieces;
    if (!medicine) return 0;
    return calculateTotalStock(medicine.stock_distribution, medicine.stock_quantity);
  }, [liveTotalPieces, medicine]);

  const totalStockBoxes = useMemo(() => {
    return (totalStockPieces / boxUnits).toFixed(1);
  }, [totalStockPieces, boxUnits]);

  const locationBreakdown = useMemo(() => {
    if (liveBreakdown.length > 0) return liveBreakdown;
    if (!medicine) return [];
    return getLocationBreakdown(medicine, locations);
  }, [liveBreakdown, medicine, locations]);

  // Input Auto-Highlight & Smooth Keyboard Scroll-into-view
  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
    const target = e.target;
    // Delay slightly so mobile virtual keyboard layout resize completes, then scroll focused element into clear view
    setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, []);

  // Clear all button handler
  const handleClearAll = () => {
    setBoxNo("1");
    setPcsPerBox("1");
    setMinQtyAlert("0");
    if (canEditPrice) {
      setBtpPrice("");
      setSalePrice("");
      setIsSaleManuallyEdited(false);
      setIsBtpManuallyEdited(false);
    }
    setFreeQty("");
    setBatchNo("");
    setExpiryDate("");
    if (boxNoInputRef.current) {
      boxNoInputRef.current.focus();
      boxNoInputRef.current.select();
    }
  };

  // Step 4: Custom Month-Year Expiry Dialog Handlers
  const handleOpenDatePicker = () => {
    if (expiryDate && expiryDate.includes("/")) {
      const [mStr, yStr] = expiryDate.split("/");
      const m = parseInt(mStr, 10) - 1;
      const y = parseInt(yStr, 10);
      if (!isNaN(m) && m >= 0 && m < 12) setPickerMonthIndex(m);
      if (!isNaN(y) && y >= 2020) setPickerYear(y);
    } else {
      setPickerYear(2026);
      setPickerMonthIndex(new Date().getMonth());
    }
    setShowDatePicker(true);
  };

  const handleConfirmDatePicker = () => {
    const monthFormatted = String(pickerMonthIndex + 1).padStart(2, "0");
    setExpiryDate(`${monthFormatted}/${pickerYear}`);
    setShowDatePicker(false);
  };

  // Step 5: Stock Inward Mutation with TanStack Query Cache Invalidation
  const inwardMutation = useMutation({
    mutationFn: async (vars: {
      activeBranch: any;
      bNo: number;
      pBox: number;
      fQty: number;
      totalAdded: number;
      boxSalePrice: number;
      unitSalePrice: number;
      boxPurchasePrice: number;
      unitPurchasePrice: number;
      medName: string;
      expiryDate: string;
      batchNo: string;
      minQtyAlert: string;
    }) => {
      const pharmacyId = profile?.pharmacy_id;
      if (!pharmacyId) {
        throw new Error("No pharmacy linked");
      }

      const {
        activeBranch,
        totalAdded,
        boxSalePrice,
        unitSalePrice,
        boxPurchasePrice,
        unitPurchasePrice,
        medName,
        expiryDate,
        batchNo,
        minQtyAlert,
        pBox,
        bNo,
        fQty,
      } = vars;

      // Target branch and master medicine identifiers
      const targetBranchId = activeBranch.id;
      const targetMedicineId = medicine.masterId || (medicine as any).medicine_id || medicine.id || "";

      // 1. STRICT BRANCH ISOLATION: Find or update ONLY the target branch's medicine row
      let existingRow: any = null;

      // Check if medicine.id belongs strictly to this target branch
      if (medicine.id) {
        const { data: rowById, error: fetchErr } = await supabase
          .from("medicines")
          .select("*")
          .eq("pharmacy_id", pharmacyId)
          .eq("id", medicine.id)
          .eq("location_id", targetBranchId)
          .maybeSingle();

        if (fetchErr) {
          throw new Error(`Database error querying medicine: ${fetchErr.message}`);
        }

        if (rowById) {
          existingRow = rowById;
        }
      }

      // If not found by matching ID for target branch, query strictly for location_id = targetBranchId
      if (!existingRow) {
        const { data: rowsByLoc, error: locFetchErr } = await supabase
          .from("medicines")
          .select("*")
          .eq("pharmacy_id", pharmacyId)
          .eq("location_id", targetBranchId)
          .ilike("name", medName);

        if (locFetchErr) {
          throw new Error(`Database error querying branch inventory: ${locFetchErr.message}`);
        }

        if (rowsByLoc && rowsByLoc.length > 0) {
          existingRow =
            rowsByLoc.find(
              (r) =>
                !medicine.product_size ||
                (r.product_size && r.product_size.trim().toLowerCase() === medicine.product_size.trim().toLowerCase())
            ) || rowsByLoc[0];
        }
      }

      let targetMedId = existingRow?.id || targetMedicineId || medicine.id || "";
      let finalNewStock = totalAdded;

      if (existingRow) {
        // IF EXISTS: increment ONLY target branch's inventory row (stock = current_stock + qty)
        const currentStock = Number(existingRow.stock_quantity) || 0;
        finalNewStock = currentStock + totalAdded;

        const updatePayload: Record<string, any> = {
          stock_quantity: finalNewStock,
          location_id: targetBranchId,
        };
        if (unitSalePrice > 0) updatePayload.price = unitSalePrice;
        if (expiryDate.trim()) updatePayload.expiry_date = expiryDate.trim();
        if (pBox > 1) {
          updatePayload.pcs_per_strip = pBox;
          updatePayload.strip_per_pack = 1;
        }
        if (minQtyAlert && Number(minQtyAlert) >= 0) {
          updatePayload.stock_alert = Number(minQtyAlert);
        }

        // Strictly update ONLY the target branch's row
        const { error: updErr } = await supabase
          .from("medicines")
          .update(updatePayload)
          .eq("id", existingRow.id)
          .eq("location_id", targetBranchId);

        if (updErr) {
          // Fallback if location_id column in where-clause has conflict
          await supabase.from("medicines").update(updatePayload).eq("id", existingRow.id);
        }
        targetMedId = existingRow.id;
      } else {
        // IF NOT EXISTS: Insert a new row for targetBranchId ONLY
        const insertPayload: Record<string, any> = {
          pharmacy_id: pharmacyId,
          location_id: targetBranchId,
          name: medicine.name.trim(),
          generic_name: medicine.generic_name || null,
          company_name: medicine.company_name || null,
          product_type: medicine.product_type || "Tablet",
          product_size: medicine.product_size || medicine.strength || null,
          unit_format: medicine.unit_format || null,
          format: medicine.format || null,
          strength: medicine.strength || null,
          price: unitSalePrice > 0 ? unitSalePrice : (medicine.price || 0),
          stock_quantity: totalAdded,
          stock_alert: Number(minQtyAlert) || 0,
          pcs_per_strip: pBox,
          strip_per_pack: 1,
          box_size: medicine.box_size || null,
          pack_size: medicine.pack_size || null,
          expiry_date: expiryDate.trim() || medicine.expiry_date || null,
        };

        const { data: insertedMed, error: insErr } = await supabase
          .from("medicines")
          .insert(insertPayload)
          .select()
          .maybeSingle();

        if (insErr) {
          // Collision retry: query row for this target branch and update strictly it
          const { data: retryRow } = await supabase
            .from("medicines")
            .select("*")
            .eq("pharmacy_id", pharmacyId)
            .eq("location_id", targetBranchId)
            .ilike("name", medName)
            .maybeSingle();

          if (retryRow) {
            finalNewStock = (Number(retryRow.stock_quantity) || 0) + totalAdded;
            await supabase
              .from("medicines")
              .update({ stock_quantity: finalNewStock, location_id: targetBranchId })
              .eq("id", retryRow.id)
              .eq("location_id", targetBranchId);
            targetMedId = retryRow.id;
          } else {
            throw new Error(`Failed to insert branch stock: ${insErr.message}`);
          }
        } else if (insertedMed?.id) {
          targetMedId = insertedMed.id;
          finalNewStock = totalAdded;
        }
      }

      // Supplementary inventory table support (branch_id + medicine_id)
      // Strictly WHERE medicine_id = targetMedicineId AND branch_id = targetBranchId
      const candidateMedIds = Array.from(new Set([targetMedicineId, targetMedId, medicine.id].filter(Boolean)));
      for (const mId of candidateMedIds) {
        try {
          const { data: invRows } = await supabase
            .from("inventory" as any)
            .select("*")
            .eq("medicine_id", mId)
            .eq("branch_id", targetBranchId);

          if (invRows && invRows.length > 0) {
            const currInvStock = Number(invRows[0].stock) || 0;
            await supabase
              .from("inventory" as any)
              .update({
                stock: currInvStock + totalAdded,
                batch_number: batchNo.trim() || invRows[0].batch_number || null,
                expiry_date: expiryDate.trim() || invRows[0].expiry_date || null,
                purchase_price: boxPurchasePrice,
                selling_price: boxSalePrice,
              })
              .eq("medicine_id", mId)
              .eq("branch_id", targetBranchId);
          } else {
            await supabase
              .from("inventory" as any)
              .insert({
                branch_id: targetBranchId,
                medicine_id: mId,
                stock: totalAdded,
                batch_number: batchNo.trim() || null,
                expiry_date: expiryDate.trim() || null,
                purchase_price: boxPurchasePrice,
                selling_price: boxSalePrice,
              });
          }
        } catch {
          // Non-fatal if inventory table does not exist
        }
      }

      // Insert batch record tied exclusively to targetBranchId
      const batchPayload = {
        pharmacy_id: pharmacyId,
        branch_id: targetBranchId,
        location_id: targetBranchId,
        medicine_id: targetMedId,
        batch_number: batchNo.trim() || null,
        expiry_date: expiryDate.trim() || null,
        purchase_price: boxPurchasePrice,
        selling_price: boxSalePrice,
        quantity: totalAdded,
        created_at: new Date().toISOString(),
      };

      try {
        await (supabase.from("batches" as any) as any).insert(batchPayload);
      } catch {}
      try {
        await (supabase.from("medicine_batches" as any) as any).insert(batchPayload);
      } catch {}

      // Inform parent component if onSaveInventory or onSave was provided
      const parentPayload: InventoryItemPayload = {
        medicineId: targetMedId || medicine.id || "",
        masterMedicineId: medicine.masterId,
        name: medicine.name,
        companyName: medicine.company_name || null,
        productType: medicine.product_type || "Tablet",
        unitFormat: medicine.unit_format || null,
        productSize: medicine.product_size || medicine.strength || null,
        genericName: medicine.generic_name || null,
        pcsPerBox: pBox,
        boxNo: bNo,
        totalQtyPieces: totalQtyPieces,
        minQtyAlert: Number(minQtyAlert) || 0,
        branch_id: targetBranchId,
        location_id: targetBranchId,
        boxPrice: boxSalePrice,
        unitPrice: unitSalePrice,
        purchasePriceBox: boxPurchasePrice,
        purchasePriceUnit: unitPurchasePrice,
        salePrice: boxSalePrice,
        btpPrice: boxPurchasePrice,
        freeQty: fQty,
        expiryDate: expiryDate.trim(),
        totalPurchaseCost: Number(totalPriceDisplay),
        batchNumber: batchNo.trim() || undefined,
        minQty: Number(minQtyAlert) || 0,
        btpWithVat: boxPurchasePrice,
        totalAddedPieces: totalAdded,
        totalBoxesQty: bNo,
        _alreadyPersisted: true,
      } as any;

      if (onSaveInventory) {
        try {
          await onSaveInventory(parentPayload);
        } catch (e) {
          console.warn("[InventoryUpdateModal] onSaveInventory note:", e);
        }
      } else if (onSave) {
        try {
          await onSave(parentPayload);
        } catch (e) {
          console.warn("[InventoryUpdateModal] onSave note:", e);
        }
      }

      return {
        targetMedId,
        newStock: finalNewStock,
        totalAdded,
        activeBranch,
        medicineName: medicine.name,
        boxSalePrice,
        boxPurchasePrice,
        pBox,
      };
    },
    onSuccess: async (data) => {
      // 2. REACT QUERY / CACHE INVALIDATION:
      const targetMedId = data.targetMedId || medicine?.id || "";
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["product", targetMedId] }),
        queryClient.invalidateQueries({ queryKey: ["product", data.medicineName] }),
        queryClient.invalidateQueries({ queryKey: ["product"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["branch-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["branch-stock", data.activeBranch.id] }),
        queryClient.invalidateQueries({ queryKey: ["medicines"] }),
      ]);

      // 3. RE-RENDER CONFIRMATION:
      // Immediately update local component state with new returned total so badge reflects new stock
      setCurrentBranchStock(data.newStock);
      setLiveTotalPieces((prev) => (prev !== null ? prev + data.totalAdded : data.newStock));
      setLiveBreakdown((prev) => {
        const found = prev.some(
          (b) =>
            b.location.id === data.activeBranch.id ||
            (data.activeBranch.code && b.location.code === data.activeBranch.code)
        );
        if (found) {
          return prev.map((b) =>
            b.location.id === data.activeBranch.id ||
            (data.activeBranch.code && b.location.code === data.activeBranch.code)
              ? { ...b, qty: data.newStock }
              : b
          );
        }
        return [...prev, { location: data.activeBranch, qty: data.newStock, percent: 100 }];
      });
      setDistributionRefreshKey((prev) => prev + 1);

      // Trigger reactive global event for all listeners
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inventory-updated", {
            detail: {
              timestamp: Date.now(),
              medicineName: data.medicineName,
              branchId: data.activeBranch.id,
              addedPieces: data.totalAdded,
              newStock: data.newStock,
            },
          })
        );
      }

      // ONLY show toast alert AFTER database response returns success with no errors
      toast.success(`${data.medicineName}: +${data.totalAdded} pcs credited to ${data.activeBranch.name}`);

      // Reset form fields inside modal
      setBoxNo("1");
      setPcsPerBox(String(medicine?.pcs_per_strip || "1"));
      setMinQtyAlert("0");
      setExpiryDate("");
      setBtpPrice("");
      setSalePrice("");
      setFreeQty("");
      setBatchNo("");
      setIsSaleManuallyEdited(false);
      setIsBtpManuallyEdited(false);

      if (boxNoInputRef.current) {
        boxNoInputRef.current.focus();
        boxNoInputRef.current.select();
      }

      // Trigger price update notification if authorized user modified pricing
      const prevBoxMrp = initialBoxPriceRef.current;
      const prevBtp = initialBtpPriceRef.current;
      const mrpChanged = Math.abs(data.boxSalePrice - prevBoxMrp) >= 0.01;
      const btpChanged = Math.abs(data.boxPurchasePrice - prevBtp) >= 0.01;

      let effectiveOldMrp = prevBoxMrp;
      if (effectiveOldMrp <= 0 && medicine?.masterUnitPrice && medicine.masterUnitPrice > 0) {
        effectiveOldMrp = roundMoney(medicine.masterUnitPrice * data.pBox);
      }
      const hasValidPriceDiff = effectiveOldMrp > 0 && Math.abs(data.boxSalePrice - effectiveOldMrp) >= 0.01;
      const shouldNotifyPriceUpdate = canEditPrice && ((prevBoxMrp > 0 && (mrpChanged || btpChanged)) || hasValidPriceDiff);

      if (shouldNotifyPriceUpdate && profile?.pharmacy_id) {
        const authorName =
          profile.full_name?.trim() ||
          user?.user_metadata?.full_name ||
          user?.email?.split("@")[0] ||
          (effectiveRole === "manager" ? "Manager" : "Owner");

        notifyPriceUpdate({
          shopId: profile.pharmacy_id,
          medicineName: data.medicineName,
          medicineId: data.targetMedId,
          userName: authorName,
          currentUserId: user?.id || "",
          oldMrp: effectiveOldMrp > 0 ? effectiveOldMrp : prevBoxMrp,
          newMrp: data.boxSalePrice,
          oldBtp: prevBtp,
          newBtp: data.boxPurchasePrice,
        }).catch((err) => {
          console.warn("[InventoryUpdateModal] Notification dispatch error:", err);
        });
      }

      // Background refetch of live distribution to guarantee external consistency
      if (profile?.pharmacy_id && data.medicineName) {
        fetchLiveMedicineDistribution(
          profile.pharmacy_id,
          data.medicineName,
          locations
        ).then((updatedDist) => {
          setLiveBreakdown(updatedDist.breakdown);
          setLiveTotalPieces(updatedDist.totalPieces);
          const entry = updatedDist.breakdown.find(
            (b) =>
              b.location.id === data.activeBranch.id ||
              (data.activeBranch.code && b.location.code === data.activeBranch.code)
          );
          if (entry !== undefined) {
            setCurrentBranchStock(entry.qty);
          }
        }).catch((e) => console.warn("Background distribution refetch note:", e));
      }
    },
    onError: (err: any) => {
      console.error("[InventoryUpdateModal] Stock inward mutation failed:", err);
      toast.error(err?.message || "Failed to update stock");
    },
  });

  const isSaving = saving || inwardMutation.isPending;

  // Step 6: Submission handler on Done
  const handleDone = async () => {
    if (!medicine) return;

    // 1. Dismiss active keyboard focus
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // 1. CAPTURE ACTIVE TARGET BRANCH strictly from selectedBranch or active context
    const activeBranch =
      selectedBranch ||
      (activeLocation && activeLocation.id !== "all" ? activeLocation : null) ||
      (locations.length > 0 ? locations[0] : null);
    if (!activeBranch || !activeBranch.id || activeBranch.id === "all" || !activeBranch.name) {
      toast.error("Please select an active branch first");
      return;
    }

    const saleNum = Number(salePrice);
    if (salePrice && (isNaN(saleNum) || saleNum < 0)) {
      toast.error("Please enter a valid MRP / Sale price");
      return;
    }

    const btpNum = Number(btpPrice);
    if (btpPrice && (isNaN(btpNum) || btpNum < 0)) {
      toast.error("Please enter a valid BTP+VAT price");
      return;
    }

    const bNo = Number(boxNo) || 0;
    const pBox = Math.max(1, Number(pcsPerBox) || 1);
    const fQty = Number(freeQty) || 0;
    const totalAdded = totalQtyPieces + fQty;

    if (totalQtyPieces <= 0 && fQty <= 0) {
      toast.error("Please specify a Box quantity or units");
      return;
    }

    const boxSalePrice = saleNum > 0 ? roundMoney(saleNum) : (unitMrpTracked > 0 ? roundMoney(unitMrpTracked * pBox) : 0);
    const unitSalePrice = unitMrpTracked > 0
      ? roundUnitPrice(unitMrpTracked)
      : (pBox > 1 ? roundUnitPrice(boxSalePrice / pBox) : boxSalePrice);

    const boxPurchasePrice = btpNum > 0 ? roundMoney(btpNum) : roundMoney(boxSalePrice * 0.88);
    const unitPurchasePrice = pBox > 1 ? roundUnitPrice(boxPurchasePrice / pBox) : boxPurchasePrice;

    setSaving(true);
    try {
      await inwardMutation.mutateAsync({
        activeBranch,
        bNo,
        pBox,
        fQty,
        totalAdded,
        boxSalePrice,
        unitSalePrice,
        boxPurchasePrice,
        unitPurchasePrice,
        medName: medicine.name.trim(),
        expiryDate: expiryDate.trim(),
        batchNo: batchNo.trim(),
        minQtyAlert,
      });
    } catch {
      // Handled by inwardMutation.onError
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !medicine || typeof document === "undefined") return null;

  // Step 1: Root-Level Fullscreen Portal & Overlay (z-index: 9999, completely above bottom tabs)
  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-end items-center pointer-events-auto"
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      }}
    >
      {/* Dimmed Backdrop (rgba(0, 0, 0, 0.45)) */}
      <div
        className="fixed inset-0 transition-opacity duration-200"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Step 1 & 2: Smooth Bottom-Sheet Card (Flexible Dimensions & Compact Padding) */}
      <div
        id="inventory-update-modal"
        className="relative z-10 w-full max-w-lg bg-white rounded-t-[24px] shadow-2xl flex flex-col border-t border-gray-100 overflow-hidden"
        style={{
          maxHeight: "90vh",
          transform: "translateZ(0)",
          transition: "transform 0.25s cubic-bezier(0.33, 1, 0.68, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Fixed Header: Drag indicator, Product details title, and Remove button */}
        <div className="flex-shrink-0 bg-white pt-2.5 pb-2 border-b border-gray-100">
          <div className="flex justify-center pb-1.5">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="px-4 flex items-center justify-between">
            <div className="w-16">
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 text-center flex-1 truncate">
              Product details
            </h2>
            <div className="w-16 flex justify-end">
              {onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  className="text-xs font-bold text-[#E11D48] hover:text-rose-700 transition-colors active:scale-95"
                >
                  Remove
                </button>
              ) : (
                <div className="w-8" />
              )}
            </div>
          </div>
        </div>

        {/* 2. Scrollable Content Body: Wrap Product Summary Card, 2-Column Grid, and Action Buttons */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2.5 overscroll-contain"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Product Overview Card (Compact #F0F9FF) */}
          <div className="bg-[#F0F9FF] border border-sky-100 rounded-xl p-2.5 sm:p-3 text-left shadow-xs">
            <h3 className="font-extrabold text-sm sm:text-base text-gray-900 tracking-tight uppercase">
              {medicine.name}
            </h3>

            {medicine.company_name && (
              <p className="text-[10px] sm:text-[11px] font-bold text-gray-600 mt-0.5 uppercase tracking-wide">
                {medicine.company_name}
              </p>
            )}

            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[11px] sm:text-xs font-medium text-slate-600 uppercase">
                {medicine.product_type || medicine.unit_format || "TABLET"}
                {(medicine.product_size || medicine.strength) &&
                  ` , ${medicine.product_size || medicine.strength}`}
              </span>
            </div>

            {medicine.generic_name && (
              <p className="text-[11px] sm:text-xs font-medium text-cyan-800 mt-0.5">
                <span className="text-gray-500">Generic : </span>
                <span className="text-cyan-700 underline underline-offset-2 decoration-cyan-300 font-semibold">
                  {medicine.generic_name}
                </span>
              </p>
            )}

            {!isAllLocations ? (
              <div className="mt-1.5 flex items-center justify-between text-[11px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                <span className="flex items-center gap-1.5">
                  <Building2 size={13} className="text-emerald-600 flex-shrink-0" />
                  <span>Stock ({selectedBranch?.name || activeLocation?.name || "Selected Branch"}):</span>
                </span>
                <span className="tabular-nums font-bold">
                  {branchStockPieces} PIECE, {branchStockBoxes} box
                </span>
              </div>
            ) : (
              <div className="mt-2 p-2.5 bg-slate-50/90 rounded-xl border border-slate-200/80 text-xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/70 mb-2">
                  <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11px]">
                    <Layers size={13} className="text-[#CC3333] flex-shrink-0" />
                    <span>Stock Distribution</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-900 tabular-nums">
                    Total: <span className="text-emerald-700 font-bold">{totalStockPieces} pcs</span>
                    <span className="text-slate-400 font-normal ml-1">({totalStockBoxes} bx)</span>
                  </div>
                </div>

                {locationBreakdown.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic py-1 text-center">
                    No recorded stock across locations
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {locationBreakdown.map((item) => (
                      <div
                        key={item.location.id}
                        className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60 shadow-2xs flex items-center justify-between gap-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-800 truncate" title={item.location.name}>
                            {item.location.name}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className={cn(
                                "text-[8px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider",
                                item.location.type === "warehouse"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              )}
                            >
                              {item.location.type}
                            </span>
                            {item.location.code && (
                              <span className="text-[9px] text-slate-400 font-mono">
                                {item.location.code}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xs font-bold text-slate-900 font-mono tabular-nums">
                            {item.qty}
                          </span>
                          <span className="text-[9px] text-slate-400 block -mt-0.5">pcs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top Metric Header (Right Side Only: Total Price directly above right column) */}
          <div className="flex items-center justify-between pt-0.5 pb-0.5 border-b border-gray-100">
            <span className="text-xs sm:text-sm font-bold text-gray-900">Order</span>
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200/80 shadow-xs tabular-nums">
              Total Price : ৳ {totalPriceDisplay}
            </div>
          </div>

          {/* Collapsible Quick Calculator */}
          {showCalculator && (
            <div className="py-1">
              <QuickCalculator onClose={() => setShowCalculator(false)} />
            </div>
          )}

          {/* Step 3: Precise 2-Column Field Order & Compact Input Rows (gap-2) */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-0.5 pb-2">
            {/* ================= ROW 1 ================= */}
            {/* Left Col (1): Box No (Editable numeric input, default: 1) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[58px]">
                Box No :
              </label>
              <input
                ref={boxNoInputRef}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={boxNo}
                onFocus={handleInputFocus}
                onChange={(e) => setBoxNo(e.target.value)}
                placeholder="1"
                className="w-full h-8 px-2 text-center text-xs sm:text-sm font-bold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] tabular-nums"
              />
            </div>

            {/* Right Col (1): BTP+VAT(৳) (Box purchase price, default: Sale * 0.88) */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center justify-between gap-1.5">
                <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[70px] flex items-center gap-1">
                  <span>BTP+VAT(৳) :</span>
                  {!canEditPrice && <Lock size={12} className="text-gray-400 shrink-0" />}
                </label>
                <div
                  className={`w-full relative ${!canEditPrice ? "cursor-not-allowed" : ""}`}
                  onClick={handlePricingFieldClick}
                  title={!canEditPrice ? "Only Owner or Manager can edit pricing" : undefined}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={btpPrice}
                    disabled={!canEditPrice}
                    readOnly={!canEditPrice}
                    tabIndex={!canEditPrice ? -1 : undefined}
                    onFocus={canEditPrice ? handleInputFocus : undefined}
                    onChange={(e) => handleBtpPriceChange(e.target.value)}
                    placeholder="0.00"
                    className={`w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md tabular-nums transition-colors ${
                      canEditPrice
                        ? "border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] text-gray-900"
                        : "border border-gray-200 bg-[#F3F4F6] text-gray-500 cursor-not-allowed select-none focus:outline-none"
                    }`}
                  />
                </div>
              </div>
              {Number(pcsPerBox) > 1 && Number(btpPrice) > 0 && (
                <div className="text-[10px] text-gray-500 font-mono text-right pr-1 pt-0.5">
                  ≈ ৳{(Number(btpPrice) / Number(pcsPerBox)).toFixed(2)}/pc
                </div>
              )}
            </div>

            {/* ================= ROW 2 ================= */}
            {/* Left Col (2): Pcs/Box (Packaging size, default from catalog) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[58px]">
                Pcs/Box :
              </label>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={pcsPerBox}
                onFocus={handleInputFocus}
                onChange={(e) => handlePcsPerBoxChange(e.target.value)}
                placeholder="1"
                className="w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] tabular-nums"
              />
            </div>

            {/* Right Col (2): Sale (Box retail price / MRP) */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center justify-between gap-1.5">
                <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[70px] flex items-center gap-1">
                  <span>Sale :</span>
                  {!canEditPrice && <Lock size={12} className="text-gray-400 shrink-0" />}
                </label>
                <div
                  className={`w-full relative ${!canEditPrice ? "cursor-not-allowed" : ""}`}
                  onClick={handlePricingFieldClick}
                  title={!canEditPrice ? "Only Owner or Manager can edit pricing" : undefined}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={salePrice}
                    disabled={!canEditPrice}
                    readOnly={!canEditPrice}
                    tabIndex={!canEditPrice ? -1 : undefined}
                    onFocus={canEditPrice ? handleInputFocus : undefined}
                    onChange={(e) => handleSalePriceChange(e.target.value)}
                    placeholder="0.00"
                    className={`w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md tabular-nums transition-colors ${
                      canEditPrice
                        ? "border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] text-gray-900"
                        : "border border-gray-200 bg-[#F3F4F6] text-gray-500 cursor-not-allowed select-none focus:outline-none"
                    }`}
                  />
                </div>
              </div>
              {Number(pcsPerBox) > 1 && unitMrpTracked > 0 && (
                <div className="text-[10px] text-[#A32D37] font-mono font-medium text-right pr-1 pt-0.5">
                  =৳{unitMrpTracked.toFixed(2)}/pc
                </div>
              )}
            </div>

            {/* ================= ROW 3 ================= */}
            {/* Left Col (3): MIN QTY (Low-stock threshold, default: 0) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[58px]">
                MIN QTY :
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={minQtyAlert}
                onFocus={handleInputFocus}
                onChange={(e) => setMinQtyAlert(e.target.value)}
                placeholder="0"
                className="w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] tabular-nums"
              />
            </div>

            {/* Right Col (3): Free QTY (Bonus units, default: 0) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[70px]">
                Free QTY :
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={freeQty}
                onFocus={handleInputFocus}
                onChange={(e) => setFreeQty(e.target.value)}
                placeholder="0"
                className="w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] tabular-nums"
              />
            </div>

            {/* ================= ROW 4 ================= */}
            {/* Left Col (4): T/QTY (Read-only / calculated: Box No * Pcs/Box) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[58px]">
                T/QTY :
              </label>
              <div
                title="Auto-calculated total units (Box No × Pcs/Box)"
                className="w-full h-8 px-2 flex items-center justify-center text-xs sm:text-sm font-extrabold rounded-md border-[1.5px] border-[#A32D37] bg-gray-50 text-slate-900 tabular-nums cursor-default select-none shadow-xs"
              >
                {totalQtyPieces}
              </div>
            </div>

            {/* Right Col (4): Batch / Note (Text input aligned horizontally with T/QTY) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[70px]">
                Batch / Note :
              </label>
              <input
                type="text"
                value={batchNo}
                onFocus={handleInputFocus}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="e.g. B-01"
                className="w-full h-8 px-2 text-center text-xs font-semibold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37]"
              />
            </div>

            {/* ================= ROW 5 ================= */}
            {/* Left Col (5): Expiry (Compact input with calendar icon, opens month-picker modal) */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[58px]">
                Expiry :
              </label>
              <button
                type="button"
                onClick={handleOpenDatePicker}
                className="w-full h-8 px-2 rounded-md border-[1.5px] border-[#A32D37] bg-white flex items-center justify-between text-xs font-semibold text-gray-800 hover:bg-rose-50/20 active:scale-[0.99] transition-all"
              >
                <span className={expiryDate ? "text-gray-900 font-bold" : "text-gray-400 font-normal"}>
                  {expiryDate || "MM/YYYY"}
                </span>
                <CalendarIcon size={14} className="text-[#A32D37] flex-shrink-0" />
              </button>
            </div>

            {/* Right Col (5): Calculator Button (Aligned horizontally with Expiry) */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCalculator((prev) => {
                    const next = !prev;
                    if (next && scrollContainerRef.current) {
                      setTimeout(() => {
                        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }, 50);
                    }
                    return next;
                  });
                }}
                className={`w-full h-8 px-2 rounded-md border-[1.5px] flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-[0.98] cursor-pointer ${
                  showCalculator
                    ? "bg-[#A32D37] text-white border-[#A32D37] shadow-sm shadow-[#A32D37]/30"
                    : "bg-white text-[#A32D37] border-[#A32D37] hover:bg-rose-50/40"
                }`}
              >
                <CalculatorIcon size={14} />
                <span>Calculator</span>
              </button>
            </div>
          </div>

          {/* Action Buttons: Clear all & Done (Inside ScrollView right below Expiry & Batch/Note) */}
          <div
            className="pt-2"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 28px))",
            }}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isSaving}
                className="flex-1 h-11 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold text-xs sm:text-sm hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RotateCcw size={14} className="text-gray-500" />
                Clear all
              </button>

              <button
                type="button"
                onClick={handleDone}
                disabled={isSaving}
                className="flex-1 h-11 rounded-xl bg-[#A32D37] hover:bg-[#8D232C] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#A32D37]/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    ✓ Done
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step 4: Custom Month-Year Expiry Dialog (Centered Modal rendered at z-[10000]) */}
      {showDatePicker && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
          onClick={() => setShowDatePicker(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xs p-4 sm:p-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm sm:text-base font-bold text-gray-900 text-center mb-3">
              Select Expiry Month
            </h3>

            {/* Year Stepper: < 2026 > with left/right buttons */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-xl mb-3.5 border border-gray-200/80">
              <button
                type="button"
                onClick={() => setPickerYear((y) => y - 1)}
                className="p-1 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
                aria-label="Previous Year"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm sm:text-base font-extrabold text-gray-900 tracking-wide font-mono">
                {pickerYear}
              </span>
              <button
                type="button"
                onClick={() => setPickerYear((y) => y + 1)}
                className="p-1 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
                aria-label="Next Year"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* 3x4 Grid Containing all 12 Months (Jan - Dec) with solid maroon pill highlight (#A32D37) */}
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {MONTHS_SHORT.map((monthName, idx) => {
                const isSelected = pickerMonthIndex === idx;
                return (
                  <button
                    key={monthName}
                    type="button"
                    onClick={() => setPickerMonthIndex(idx)}
                    className={`py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 ${
                      isSelected
                        ? "bg-[#A32D37] text-white shadow-sm shadow-[#A32D37]/30"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {monthName}
                  </button>
                );
              })}
            </div>

            {/* Actions: CANCEL and OK */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowDatePicker(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmDatePicker}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#A32D37] hover:bg-[#8D232C] rounded-lg shadow-sm shadow-[#A32D37]/20 transition-all active:scale-95"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default InventoryUpdateModal;
