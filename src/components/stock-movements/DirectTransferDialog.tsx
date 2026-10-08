import React, { useState, useEffect, useMemo } from "react";
import { Location } from "@/types/location";
import { useLocationStore } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send,
  RefreshCw,
  Search,
  PackageCheck,
  Plus,
  Trash2,
  ChevronsUpDown,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

export interface MedicineOption {
  id: string;
  name: string;
  generic_name?: string | null;
  product_size?: string | null;
  strength?: string | null;
  stock_quantity?: number | null;
  location_id?: string | null;
  format?: string | null;
  product_type?: string | null;
  unit_format?: string | null;
  packaging_type?: string | null;
}

export interface TransferItemRow {
  medicine_id: string;
  name: string;
  generic_name?: string | null;
  dosage?: string | null;
  quantity: number | "";
  unit: string;
  available_stock: number;
  allowedUnits: string[];
}

const DEFAULT_ALLOWED_UNITS = ["pcs", "box", "strip", "bottle"];
const DEFAULT_UNIT = "pcs";

function getUnitsForMedicine(
  medicine?: MedicineOption | null,
  nameFallback?: string
): { allowedUnits: string[]; defaultUnit: string } {
  const rawFormat = (medicine?.format || "").toLowerCase().trim();
  const rawProductType = (medicine?.product_type || "").toLowerCase().trim();
  const rawUnitFormat = (medicine?.unit_format || "").toLowerCase().trim();
  const rawPkg = (medicine?.packaging_type || "").toLowerCase().trim();
  const rawName = (medicine?.name || nameFallback || "").toLowerCase().trim();

  const combined = `${rawFormat} ${rawProductType} ${rawUnitFormat} ${rawPkg} ${rawName}`;

  if (
    /(?:tablets?|tabs?|capsules?|caps?|softgels?|soft\s*gelatin|bolus)/i.test(combined) &&
    !/(?:syrup|suspension|drop|injection|suppository)/i.test(combined)
  ) {
    return {
      allowedUnits: ["box", "strip", "pcs"],
      defaultUnit: "box",
    };
  }

  if (
    /(?:syrups?|suspensions?|drops?|oral\s*liquid|oral\s*solution|solutions?|pediatric\s*drops?|eye\s*drops?|ear\s*drops?|nasal\s*drops?)/i.test(
      combined
    )
  ) {
    return {
      allowedUnits: ["bottle", "box", "pcs"],
      defaultUnit: "bottle",
    };
  }

  if (
    /(?:injections?|inj\b|iv\b|im\b|vials?|ampoules?|ampules?|suppository|suppositories|supp\b)/i.test(
      combined
    )
  ) {
    return {
      allowedUnits: ["box", "pcs"],
      defaultUnit: "pcs",
    };
  }

  return {
    allowedUnits: DEFAULT_ALLOWED_UNITS,
    defaultUnit: DEFAULT_UNIT,
  };
}

const createInitialRow = (): TransferItemRow => ({
  medicine_id: "",
  name: "",
  generic_name: null,
  dosage: null,
  quantity: 1,
  unit: DEFAULT_UNIT,
  available_stock: 0,
  allowedUnits: DEFAULT_ALLOWED_UNITS,
});

interface DirectTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLocation: Location | null;
  locations: Location[];
  pharmacyId?: string | null;
  onSuccess: () => void;
}

export const DirectTransferDialog: React.FC<DirectTransferDialogProps> = ({
  open,
  onOpenChange,
  activeLocation,
  locations,
  pharmacyId,
  onSuccess,
}) => {
  const { initiateTransfer } = useLocationStore();

  const [targetLocationId, setTargetLocationId] = useState<string>("");
  const [transferItems, setTransferItems] = useState<TransferItemRow[]>([createInitialRow()]);
  const [notes, setNotes] = useState<string>("");
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [isLoadingMeds, setIsLoadingMeds] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Popover state for medicine autocomplete per row
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);
  const [rowSearchQuery, setRowSearchQuery] = useState<string>("");

  // Eligible destination locations
  const availableDestinations = useMemo(
    () => locations.filter((l) => l.id !== activeLocation?.id),
    [locations, activeLocation?.id]
  );

  // Reset defaults on modal open
  useEffect(() => {
    if (open) {
      if (availableDestinations.length > 0) {
        setTargetLocationId(availableDestinations[0].id);
      } else {
        setTargetLocationId("");
      }
      setTransferItems([createInitialRow()]);
      setNotes("");
      setOpenPopoverIdx(null);
      setRowSearchQuery("");
    }
  }, [open, availableDestinations]);

  // Set fallback destination if targetLocationId was unset when destinations loaded
  useEffect(() => {
    if (open && !targetLocationId && availableDestinations.length > 0) {
      setTargetLocationId(availableDestinations[0].id);
    }
  }, [open, targetLocationId, availableDestinations]);

  // Fetch inventory medicines for current origin location
  useEffect(() => {
    if (!pharmacyId || !open || !activeLocation?.id) return;

    const fetchMeds = async () => {
      setIsLoadingMeds(true);
      try {
        const { data, error } = await supabase
          .from("medicines")
          .select(
            "id, name, generic_name, product_size, stock_quantity, location_id, format, product_type, unit_format, packaging_type, strength"
          )
          .eq("pharmacy_id", pharmacyId)
          .order("name", { ascending: true })
          .limit(500);

        if (!error && data) {
          // Filter to medicines at current location or global inventory
          const localMeds = (data as MedicineOption[]).filter(
            (m) => !m.location_id || m.location_id === activeLocation.id
          );
          setMedicines(localMeds);
        }
      } catch (err) {
        console.warn("Failed to load inventory for transfer dialog:", err);
      } finally {
        setIsLoadingMeds(false);
      }
    };

    fetchMeds();
  }, [pharmacyId, open, activeLocation?.id]);

  // Filtered medicines for the active row popover
  const filteredMedsForRow = useMemo(() => {
    if (!rowSearchQuery.trim()) {
      return medicines.slice(0, 30);
    }
    const q = rowSearchQuery.toLowerCase().trim();
    return medicines
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.generic_name && m.generic_name.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [medicines, rowSearchQuery]);

  // Row Manipulation Handlers
  const handleAddRow = () => {
    setTransferItems((prev) => [createInitialRow(), ...prev]);
  };

  const handleRemoveRow = (idx: number) => {
    if (transferItems.length <= 1) return;
    setTransferItems((prev) => prev.filter((_, i) => i !== idx));
    if (openPopoverIdx === idx) {
      setOpenPopoverIdx(null);
    }
  };

  const handleRowChange = (
    idx: number,
    field: keyof TransferItemRow,
    value: any
  ) => {
    setTransferItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleSelectMedicine = (idx: number, med: MedicineOption) => {
    const { allowedUnits, defaultUnit } = getUnitsForMedicine(med, med.name);
    const stock = med.stock_quantity ?? 0;

    setTransferItems((prev) => {
      const copy = [...prev];
      const currentQty = copy[idx]?.quantity;
      let nextQty: number | "" = 1;
      if (typeof currentQty === "number" && currentQty > 0 && currentQty <= stock) {
        nextQty = currentQty;
      } else if (stock <= 0) {
        nextQty = 0;
      }

      copy[idx] = {
        ...copy[idx],
        medicine_id: med.id,
        name: med.name,
        generic_name: med.generic_name,
        dosage: med.product_size || med.strength || null,
        available_stock: stock,
        quantity: nextQty,
        unit: defaultUnit,
        allowedUnits,
      };
      return copy;
    });

    setOpenPopoverIdx(null);
    setRowSearchQuery("");
  };

  // Aggregated Summary Statistics
  const totalItemsCount = useMemo(() => {
    return transferItems.reduce((acc, it) => {
      const q = typeof it.quantity === "number" ? it.quantity : 0;
      return acc + (q > 0 ? q : 0);
    }, 0);
  }, [transferItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLocation?.id) {
      toast.error("Active location is required");
      return;
    }

    if (!targetLocationId) {
      toast.error("Please select a target destination location");
      return;
    }

    const destination = locations.find((l) => l.id === targetLocationId);
    if (!destination) {
      toast.error("Destination location not found");
      return;
    }

    if (transferItems.length === 0) {
      toast.error("Please add at least one product row to transfer");
      return;
    }

    // 1. Validate each row
    for (let i = 0; i < transferItems.length; i++) {
      const item = transferItems[i];
      const rowNum = i + 1;

      if (!item.medicine_id || !item.name.trim()) {
        toast.error(`Row #${rowNum}: Please select a medicine from stock`);
        return;
      }

      const numQty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
      if (!numQty || isNaN(numQty) || numQty <= 0) {
        toast.error(`Row #${rowNum} (${item.name}): Quantity must be greater than 0`);
        return;
      }

      if (numQty > item.available_stock) {
        toast.error(
          `Row #${rowNum} (${item.name}): Transfer quantity (${numQty}) exceeds available stock (${item.available_stock})`
        );
        return;
      }
    }

    // 2. Validate aggregated quantities if same medicine is selected in multiple rows
    const totalsByMedId: Record<string, { name: string; totalQty: number; stock: number }> = {};
    for (const item of transferItems) {
      const medId = item.medicine_id;
      const qty = Number(item.quantity);
      if (!totalsByMedId[medId]) {
        totalsByMedId[medId] = {
          name: item.name,
          totalQty: 0,
          stock: item.available_stock,
        };
      }
      totalsByMedId[medId].totalQty += qty;
    }

    for (const medId of Object.keys(totalsByMedId)) {
      const entry = totalsByMedId[medId];
      if (entry.totalQty > entry.stock) {
        toast.error(
          `Total quantity for "${entry.name}" (${entry.totalQty}) exceeds available stock (${entry.stock}) across rows`
        );
        return;
      }
    }

    // 3. Generate ONE single unified reference number and exact same timestamp for the entire batch
    const batchUuid = Math.random().toString(36).substring(2, 8).toUpperCase();
    const batchRef = `TR-BATCH-${batchUuid}`;
    const batchCreatedAt = new Date().toISOString();

    setIsSubmitting(true);
    try {
      let dispatchedCount = 0;
      for (const item of transferItems) {
        const numQty = Number(item.quantity);
        await initiateTransfer({
          from_location_id: activeLocation.id,
          from_location_name: activeLocation.name,
          to_location_id: destination.id,
          to_location_name: destination.name,
          medicine_id: item.medicine_id,
          medicine_name: item.name,
          generic_name: item.generic_name || undefined,
          dosage: item.dosage || undefined,
          quantity: numQty,
          unit: item.unit || "pcs",
          note: notes.trim() || undefined,
          reference_number: batchRef,
          created_at: batchCreatedAt,
        });
        dispatchedCount++;
      }

      toast.success(
        `Batch transfer ${batchRef} dispatched!`,
        {
          description: `${dispatchedCount} products (${totalItemsCount} total units) sent to ${destination.name}. Awaiting receipt.`,
        }
      );

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Direct transfer batch dispatch error:", err);
      toast.error(err.message || "Failed to initiate transfer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDestination = locations.find((l) => l.id === targetLocationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Send className="h-5 w-5 text-indigo-600" />
            Send Direct Stock Transfer
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Push physical stock immediately from <strong>{activeLocation?.name}</strong> to a partner location.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Destination Location */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Destination Location</Label>
            <Select value={targetLocationId} onValueChange={setTargetLocationId}>
              <SelectTrigger className="mt-1.5 rounded-xl text-xs bg-slate-50">
                <SelectValue placeholder="Select destination branch or warehouse" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {availableDestinations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id} className="text-xs">
                    {loc.name} ({loc.type === "warehouse" ? "Warehouse / Godown" : "Branch"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Multi-Item Products Header & Add Button */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Products to Transfer ({transferItems.length})
                </Label>
                <p className="text-[11px] text-slate-500">
                  Add medicines and dispatch quantities from available inventory.
                </p>
              </div>

              {/* Prominent Add Product Row button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="text-xs rounded-xl h-8 gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Add Product Row
              </Button>
            </div>

            {/* Dynamic Input Rows */}
            <div className="space-y-2.5 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              {transferItems.map((item, idx) => {
                const numQty = typeof item.quantity === "number" ? item.quantity : 0;
                const isExceeded = Boolean(item.medicine_id && numQty > item.available_stock);
                const isOutOfStock = Boolean(item.medicine_id && item.available_stock <= 0);

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs"
                  >
                    {/* Autocomplete Medicine Selector */}
                    <div className="flex-1 min-w-[200px]">
                      <Popover
                        open={openPopoverIdx === idx}
                        onOpenChange={(isOpen) => {
                          setOpenPopoverIdx(isOpen ? idx : null);
                          if (isOpen) {
                            setRowSearchQuery("");
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                              item.medicine_id
                                ? "border-slate-200 bg-white hover:border-indigo-300"
                                : "border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-indigo-300"
                            }`}
                          >
                            {item.medicine_id ? (
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-slate-900 truncate">
                                  {item.name}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                                  {item.generic_name && (
                                    <span className="truncate">{item.generic_name}</span>
                                  )}
                                  {item.generic_name && <span>•</span>}
                                  <span
                                    className={`font-semibold ${
                                      item.available_stock > 0
                                        ? "text-emerald-600"
                                        : "text-rose-600"
                                    }`}
                                  >
                                    Stock: {item.available_stock} {item.unit}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Search className="h-3.5 w-3.5 text-slate-400" />
                                <span>Select medicine from stock...</span>
                              </div>
                            )}
                            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 opacity-70" />
                          </button>
                        </PopoverTrigger>

                        <PopoverContent
                          className="w-[320px] sm:w-[360px] p-2 rounded-xl shadow-xl border-slate-200 bg-white"
                          align="start"
                          sideOffset={4}
                        >
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                              placeholder="Search available medicines..."
                              value={rowSearchQuery}
                              onChange={(e) => setRowSearchQuery(e.target.value)}
                              className="pl-8 pr-7 text-xs h-8 rounded-lg bg-slate-50"
                              autoFocus
                            />
                            {rowSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setRowSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                              >
                                ×
                              </button>
                            )}
                          </div>

                          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
                            {isLoadingMeds ? (
                              <div className="p-3 text-center text-xs text-slate-400">
                                Loading medicines from stock...
                              </div>
                            ) : filteredMedsForRow.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">
                                No matching medicines found in inventory
                              </div>
                            ) : (
                              filteredMedsForRow.map((med) => {
                                const stockQty = med.stock_quantity ?? 0;
                                const isSelected = item.medicine_id === med.id;
                                return (
                                  <button
                                    key={med.id}
                                    type="button"
                                    onClick={() => handleSelectMedicine(idx, med)}
                                    className={`w-full text-left p-2 hover:bg-indigo-50/70 flex items-center justify-between transition-colors ${
                                      isSelected ? "bg-indigo-50/40" : ""
                                    }`}
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="text-xs font-medium text-slate-900 truncate">
                                        {med.name}
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {med.generic_name || med.product_size || "Standard Item"}
                                      </div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1.5">
                                      <span
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                          stockQty > 10
                                            ? "bg-emerald-100 text-emerald-800"
                                            : stockQty > 0
                                            ? "bg-amber-100 text-amber-800"
                                            : "bg-rose-100 text-rose-700"
                                        }`}
                                      >
                                        {stockQty} in stock
                                      </span>
                                      {isSelected && (
                                        <Check className="h-3.5 w-3.5 text-indigo-600" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Quantity & Unit & Trash */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Quantity Input with stock warning */}
                      <div className="w-24">
                        <Input
                          type="number"
                          min={1}
                          max={item.available_stock > 0 ? item.available_stock : undefined}
                          value={item.quantity}
                          onChange={(e) =>
                            handleRowChange(
                              idx,
                              "quantity",
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          placeholder="Qty"
                          className={`h-9 rounded-xl text-xs bg-slate-50 text-center font-medium ${
                            isExceeded
                              ? "border-rose-400 bg-rose-50/60 text-rose-700 focus-visible:ring-rose-300"
                              : ""
                          }`}
                        />
                        {isExceeded && (
                          <span className="text-[10px] text-rose-600 font-semibold block text-center leading-tight mt-0.5">
                            Max: {item.available_stock}
                          </span>
                        )}
                        {isOutOfStock && !isExceeded && (
                          <span className="text-[10px] text-rose-600 font-semibold block text-center leading-tight mt-0.5">
                            Stock: 0
                          </span>
                        )}
                      </div>

                      {/* Packaging Unit Dropdown */}
                      <div className="w-24">
                        <Select
                          value={item.unit}
                          onValueChange={(val) => handleRowChange(idx, "unit", val)}
                        >
                          <SelectTrigger className="h-9 rounded-xl text-xs bg-slate-50 capitalize">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {(item.allowedUnits || DEFAULT_ALLOWED_UNITS).map((u) => (
                              <SelectItem key={u} value={u} className="text-xs capitalize">
                                {u === "pcs" ? "Pcs" : u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Remove Trash Button */}
                      <div className="w-9 flex items-center justify-center">
                        {transferItems.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRow(idx)}
                            className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                            title="Remove product row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="h-9 w-9" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Summary Bar */}
            <div className="mt-2.5 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between text-xs">
              <span className="text-slate-600">
                Dispatch Summary:{" "}
                <strong className="text-indigo-900 font-semibold">
                  {transferItems.filter((it) => it.medicine_id).length} of {transferItems.length}
                </strong>{" "}
                products selected
              </span>
              <span className="font-bold text-indigo-700">
                Total Units: {totalItemsCount}
              </span>
            </div>
          </div>

          {/* Transfer Notes */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Transfer Note (Optional)</Label>
            <Textarea
              placeholder="e.g. Dispatched via morning courier, challan #1042..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 text-xs rounded-xl resize-none h-16 bg-slate-50"
            />
          </div>
        </form>

        <DialogFooter className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selectedDestination && (
              <span>
                To: <strong>{selectedDestination.name}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-1.5 shadow-xs font-semibold"
            >
              {isSubmitting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PackageCheck className="h-3.5 w-3.5" />
              )}
              Confirm & Dispatch Transfer ({totalItemsCount} Items)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

