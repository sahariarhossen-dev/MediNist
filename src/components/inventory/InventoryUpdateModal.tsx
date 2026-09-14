import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Calendar as CalendarIcon,
  Loader2,
  Calculator as CalculatorIcon,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Equal,
} from "lucide-react";
import { toast } from "sonner";

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
  stock_quantity?: number | null; // Existing stock in pieces
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
  onSaveInventory?: (payload: InventoryItemPayload) => Promise<boolean | void>;
  onSave?: (payload: InventoryItemPayload) => Promise<boolean | void>;
  onRemove?: () => void;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const InventoryUpdateModal: React.FC<InventoryUpdateModalProps> = ({
  isOpen,
  onClose,
  medicine,
  onSaveInventory,
  onSave,
  onRemove,
}) => {
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

  // Tracking manual overrides
  const [unitMrpTracked, setUnitMrpTracked] = useState<number>(0);
  const [isSaleManuallyEdited, setIsSaleManuallyEdited] = useState<boolean>(false);
  const [isBtpManuallyEdited, setIsBtpManuallyEdited] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // Custom Month-Year Expiry Dialog State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(2026);
  const [pickerMonthIndex, setPickerMonthIndex] = useState<number>(new Date().getMonth());

  // Compact Quick Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcClearNext, setCalcClearNext] = useState(false);

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
    // Box MRP = Unit MRP * Pcs/Box
    const rawPrice = medicine.price != null && medicine.price > 0 ? Number(medicine.price) : 0;
    setUnitMrpTracked(rawPrice);
    setIsSaleManuallyEdited(false);
    setIsBtpManuallyEdited(false);

    if (rawPrice > 0) {
      const computedBoxMrp = rawPrice * initialPackaging;
      setSalePrice(computedBoxMrp.toFixed(2));

      // BTP+VAT = Box MRP * 0.88 (12% trade discount)
      const computedBtp = (computedBoxMrp * 0.88).toFixed(2);
      setBtpPrice(computedBtp);
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
    if (!isSaleManuallyEdited && unitMrpTracked > 0 && Number.isFinite(newPcs) && newPcs > 0) {
      const newBoxMrp = unitMrpTracked * newPcs;
      setSalePrice(newBoxMrp.toFixed(2));
      if (!isBtpManuallyEdited) {
        setBtpPrice((newBoxMrp * 0.88).toFixed(2));
      }
    }
  };

  // Handle MRP / Sale Change
  const handleSalePriceChange = (val: string) => {
    setSalePrice(val);
    setIsSaleManuallyEdited(true);
    const num = Number(val);
    if (!isBtpManuallyEdited) {
      if (Number.isFinite(num) && num > 0) {
        setBtpPrice((num * 0.88).toFixed(2));
      } else {
        setBtpPrice("");
      }
    }
  };

  // Handle BTP+VAT manual change
  const handleBtpPriceChange = (val: string) => {
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

  // Summary Card formatted stock
  const currentStockPieces = medicine?.stock_quantity ?? 0;
  const currentStockBoxes = useMemo(() => {
    const pps = Number(medicine?.pcs_per_strip) || 1;
    const spp = Number(medicine?.strip_per_pack) || 1;
    const boxUnits = pps * spp;
    return boxUnits > 0 ? (currentStockPieces / boxUnits).toFixed(1) : "0.0";
  }, [currentStockPieces, medicine?.pcs_per_strip, medicine?.strip_per_pack]);

  // Input Auto-Highlight helper (selectTextOnFocus behavior)
  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  // Clear all button handler
  const handleClearAll = () => {
    setBoxNo("1");
    setPcsPerBox("1");
    setMinQtyAlert("0");
    setBtpPrice("");
    setSalePrice("");
    setFreeQty("");
    setBatchNo("");
    setExpiryDate("");
    setIsSaleManuallyEdited(false);
    setIsBtpManuallyEdited(false);
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

  // Calculator Handlers
  const handleCalcNumber = (digit: string) => {
    if (calcClearNext || calcDisplay === "0") {
      setCalcDisplay(digit);
      setCalcClearNext(false);
    } else {
      setCalcDisplay(calcDisplay + digit);
    }
  };

  const handleCalcOp = (operation: string) => {
    const current = parseFloat(calcDisplay);
    if (calcPrev !== null && calcOp) {
      let result = calcPrev;
      if (calcOp === "+") result = calcPrev + current;
      if (calcOp === "-") result = calcPrev - current;
      if (calcOp === "×" || calcOp === "*") result = calcPrev * current;
      if (calcOp === "÷" || calcOp === "/") result = current !== 0 ? calcPrev / current : 0;
      setCalcDisplay(String(Number(result.toFixed(2))));
      setCalcPrev(result);
    } else {
      setCalcPrev(current);
    }
    setCalcOp(operation);
    setCalcClearNext(true);
  };

  const handleCalcEqual = () => {
    const current = parseFloat(calcDisplay);
    if (calcPrev !== null && calcOp) {
      let result = calcPrev;
      if (calcOp === "+") result = calcPrev + current;
      if (calcOp === "-") result = calcPrev - current;
      if (calcOp === "×" || calcOp === "*") result = calcPrev * current;
      if (calcOp === "÷" || calcOp === "/") result = current !== 0 ? calcPrev / current : 0;
      setCalcDisplay(String(Number(result.toFixed(2))));
      setCalcPrev(null);
      setCalcOp(null);
      setCalcClearNext(true);
    }
  };

  const handleCalcClear = () => {
    setCalcDisplay("0");
    setCalcPrev(null);
    setCalcOp(null);
    setCalcClearNext(false);
  };

  // Step 5: Graceful Exit on Done
  const handleDone = async () => {
    if (!medicine) return;

    // 1. Dismiss active keyboard focus
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
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
    const pBox = Number(pcsPerBox) || 1;
    const fQty = Number(freeQty) || 0;
    const totalAdded = totalQtyPieces + fQty;

    if (totalQtyPieces <= 0 && fQty <= 0) {
      toast.error("Please specify a Box quantity or units");
      return;
    }

    const payload: InventoryItemPayload = {
      medicineId: medicine.id || "",
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
      salePrice: saleNum > 0 ? saleNum : Number(medicine.price || 0),
      btpPrice: btpNum > 0 ? btpNum : 0,
      freeQty: fQty,
      expiryDate: expiryDate.trim(),
      totalPurchaseCost: Number(totalPriceDisplay),
      batchNumber: batchNo.trim() || undefined,

      // Compatibility mappings
      minQty: Number(minQtyAlert) || 0,
      btpWithVat: btpNum > 0 ? btpNum : 0,
      totalAddedPieces: totalAdded,
      totalBoxesQty: bNo,
    };

    setSaving(true);
    try {
      // 2. Commit the validated payload
      if (onSaveInventory) {
        await onSaveInventory(payload);
      } else if (onSave) {
        await onSave(payload);
      }
      // 4. Provide immediate inline feedback
      toast.success(`${medicine.name} added to inventory`);
      // 3. Dismiss the modal smoothly
      onClose();
    } catch (err: any) {
      console.error("[InventoryUpdateModal] Save error:", err);
      toast.error(err?.message || "Failed to save inventory entry");
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

      {/* Step 1 & 2: Smooth Bottom-Sheet Card (Fixed Dimensions & Compact Padding) */}
      <div
        id="inventory-update-modal"
        className="relative z-10 w-full max-w-lg bg-white rounded-t-[24px] shadow-2xl flex flex-col border-t border-gray-100 overflow-hidden"
        style={{
          maxHeight: "85vh",
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

        {/* 2. Scrollable Content Body: Wrap Product Summary Card and 2-Column Grid */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2 overscroll-contain"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
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

            <p className="text-[11px] sm:text-xs font-semibold text-emerald-700 mt-1">
              Stock QTY :{" "}
              <span className="tabular-nums font-bold">
                {currentStockPieces} PIECE, {currentStockBoxes} box.
              </span>
            </p>
          </div>

          {/* Top Metric Header (Right Side Only: Total Price directly above right column) */}
          <div className="flex items-center justify-between pt-0.5 pb-0.5 border-b border-gray-100">
            <span className="text-xs sm:text-sm font-bold text-gray-900">Order</span>
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200/80 shadow-xs tabular-nums">
              Total Price : ৳ {totalPriceDisplay}
            </div>
          </div>

          {/* Collapsible Compact Calculator */}
          {showCalculator && (
            <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-800 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-slate-400 font-mono">Quick Calculator</span>
                <button
                  type="button"
                  onClick={() => setShowCalculator(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg font-mono text-right text-base font-bold text-emerald-400 mb-2 truncate">
                {calcDisplay}
              </div>
              <div className="grid grid-cols-4 gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleCalcClear}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-md"
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcOp("÷")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-md"
                >
                  ÷
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcOp("×")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-md"
                >
                  ×
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcOp("-")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-md"
                >
                  -
                </button>

                <button
                  type="button"
                  onClick={() => handleCalcNumber("7")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  7
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber("8")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  8
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber("9")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  9
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcOp("+")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-md"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => handleCalcNumber("4")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  4
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber("5")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  5
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber("6")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  6
                </button>
                <button
                  type="button"
                  onClick={handleCalcEqual}
                  className="row-span-2 p-1.5 bg-[#A32D37] hover:bg-rose-700 text-white rounded-md flex items-center justify-center font-bold"
                >
                  <Equal size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => handleCalcNumber("1")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber("2")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  2
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber("3")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  3
                </button>

                <button
                  type="button"
                  onClick={() => handleCalcNumber("0")}
                  className="col-span-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleCalcNumber(".")}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md"
                >
                  .
                </button>
              </div>
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
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[70px]">
                BTP+VAT(৳) :
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={btpPrice}
                onFocus={handleInputFocus}
                onChange={(e) => handleBtpPriceChange(e.target.value)}
                placeholder="0.00"
                className="w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] tabular-nums"
              />
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
            <div className="flex items-center justify-between gap-1.5">
              <label className="text-[11px] sm:text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[70px]">
                Sale :
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={salePrice}
                onFocus={handleInputFocus}
                onChange={(e) => handleSalePriceChange(e.target.value)}
                placeholder="0.00"
                className="w-full h-8 px-2 text-center text-xs sm:text-sm font-semibold rounded-md border-[1.5px] border-[#A32D37] bg-white focus:outline-none focus:ring-1 focus:ring-[#A32D37] tabular-nums"
              />
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

            {/* Right Col (4): Calculator Button (Aligned horizontally with T/QTY) */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowCalculator((prev) => !prev)}
                className={`w-full h-8 px-2 rounded-md border-[1.5px] flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-[0.98] ${
                  showCalculator
                    ? "bg-[#A32D37] text-white border-[#A32D37] shadow-sm shadow-[#A32D37]/30"
                    : "bg-white text-[#A32D37] border-[#A32D37] hover:bg-rose-50/40"
                }`}
              >
                <CalculatorIcon size={14} />
                <span>Calculator</span>
              </button>
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

            {/* Right Col (5): Batch / Note (Text input aligned horizontally with Expiry) */}
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
          </div>
        </div>

        {/* 3. Fixed Footer: Sticky bottom container holding Clear all and Done (Always visible) */}
        <div
          className="flex-shrink-0 px-4 pt-2.5 border-t border-gray-100 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.03)] z-20"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 12px))",
          }}
        >
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={saving}
              className="flex-1 h-11 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold text-xs sm:text-sm hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={14} className="text-gray-500" />
              Clear all
            </button>

            <button
              type="button"
              onClick={handleDone}
              disabled={saving}
              className="flex-1 h-11 rounded-xl bg-[#A32D37] hover:bg-[#8D232C] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#A32D37]/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
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
