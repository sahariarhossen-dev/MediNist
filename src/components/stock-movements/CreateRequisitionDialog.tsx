import React, { useState, useEffect, useMemo } from "react";
import { Location } from "@/types/location";
import { warehouseStorage } from "@/services/warehouseStorage";
import { supabase } from "@/integrations/supabase/client";
import { getStockForLocation } from "@/lib/multiLocationStock";
import { normalizeForSearch } from "@/lib/searchUtils";
import { Plus, Trash2, Boxes, RefreshCw } from "lucide-react";
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
import { toast } from "sonner";

interface RequisitionItemRow {
  medicine_id?: string;
  medicine_name: string;
  requested_qty: number;
  pack_unit: string;
  allowedUnits: string[];
}

const DEFAULT_ALLOWED_UNITS = ["Box", "Piece", "Strip", "Bottle"];
const DEFAULT_UNIT = "Box";

interface CatalogMedicine {
  id: string;
  name: string;
  generic_name?: string | null;
  company_name?: string | null;
  format?: string | null;
  product_type?: string | null;
  unit_format?: string | null;
  strength?: string | null;
  product_size?: string | null;
  packaging_type?: string | null;
  stock_quantity?: number | null;
  stock_distribution?: any[] | null;
  location_id?: string | null;
}

/**
 * Smart context-aware unit mapper for pharmacy items.
 * Inspects dosage formats, product types, packaging types, and parses medicine names.
 */
function getUnitsForMedicine(
  medicine?: CatalogMedicine | null,
  nameFallback?: string
): { allowedUnits: string[]; defaultUnit: string } {
  const rawFormat = (medicine?.format || "").toLowerCase().trim();
  const rawProductType = (medicine?.product_type || "").toLowerCase().trim();
  const rawUnitFormat = (medicine?.unit_format || "").toLowerCase().trim();
  const rawPkg = (medicine?.packaging_type || "").toLowerCase().trim();
  const rawName = (medicine?.name || nameFallback || "").toLowerCase().trim();

  const combined = `${rawFormat} ${rawProductType} ${rawUnitFormat} ${rawPkg} ${rawName}`;

  // 1. Tablet / Capsule -> ["Box", "Strip"], default to "Box"
  const isTabletOrCapsule =
    /(?:tablets?|tabs?|capsules?|caps?|softgels?|soft\s*gelatin|bolus)/i.test(combined) &&
    !/(?:syrup|suspension|drop|injection|suppository)/i.test(combined);

  if (isTabletOrCapsule) {
    return {
      allowedUnits: ["Box", "Strip"],
      defaultUnit: "Box",
    };
  }

  // 2. Syrup / Suspension / Drop -> ["Bottle", "Box", "Piece"], default to "Bottle" or "Piece"
  const isSyrupSuspensionDrop =
    /(?:syrups?|suspensions?|drops?|oral\s*liquid|oral\s*solution|solutions?|pediatric\s*drops?|eye\s*drops?|ear\s*drops?|nasal\s*drops?)/i.test(
      combined
    );

  if (isSyrupSuspensionDrop) {
    const isDrop = /(?:drops?|eye|ear|nasal)/i.test(combined);
    return {
      allowedUnits: ["Bottle", "Box", "Piece"],
      defaultUnit: isDrop ? "Piece" : "Bottle",
    };
  }

  // 3. Injection / Suppository -> ["Box", "Piece"], default to "Piece"
  const isInjectionOrSuppository =
    /(?:injections?|inj\b|iv\b|im\b|vials?|ampoules?|ampules?|suppository|suppositories|supp\b)/i.test(
      combined
    );

  if (isInjectionOrSuppository) {
    return {
      allowedUnits: ["Box", "Piece"],
      defaultUnit: "Piece",
    };
  }

  // 4. Default fallback -> ["Box", "Piece", "Strip", "Bottle"], default to "Box"
  return {
    allowedUnits: DEFAULT_ALLOWED_UNITS,
    defaultUnit: DEFAULT_UNIT,
  };
}

interface CreateRequisitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLocation: Location | null;
  locations: Location[];
  pharmacyId?: string | null;
  onSuccess: () => void;
}

export const CreateRequisitionDialog: React.FC<CreateRequisitionDialogProps> = ({
  open,
  onOpenChange,
  activeLocation,
  locations,
  pharmacyId,
  onSuccess,
}) => {
  const [targetLocationId, setTargetLocationId] = useState<string>("");
  const [priority, setPriority] = useState<"normal" | "urgent" | "emergency">("normal");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<RequisitionItemRow[]>([
    {
      medicine_name: "",
      requested_qty: 1,
      pack_unit: DEFAULT_UNIT,
      allowedUnits: DEFAULT_ALLOWED_UNITS,
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [medicinesCatalog, setMedicinesCatalog] = useState<CatalogMedicine[]>([]);
  const [activeDropdownIdx, setActiveDropdownIdx] = useState<number | null>(null);

  // Eligible destination locations (cannot be active location)
  const availableSources = useMemo(
    () => locations.filter((l) => l.id !== activeLocation?.id),
    [locations, activeLocation?.id]
  );

  // Supplying location instance
  const supplyingLocation = useMemo(
    () => locations.find((l) => l.id === targetLocationId),
    [locations, targetLocationId]
  );

  // Set default source when opened
  useEffect(() => {
    if (open) {
      // Prioritize warehouse/godown locations
      const warehouseSource = availableSources.find(
        (l) => l.type === "warehouse" || (l.type as string) === "godown"
      );
      setTargetLocationId(warehouseSource ? warehouseSource.id : availableSources[0]?.id || "");
      setPriority("normal");
      setNotes("");
      setActiveDropdownIdx(null);
      setItems([
        {
          medicine_name: "",
          requested_qty: 1,
          pack_unit: DEFAULT_UNIT,
          allowedUnits: DEFAULT_ALLOWED_UNITS,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Set fallback source if targetLocationId was unset when sources loaded
  useEffect(() => {
    if (open && !targetLocationId && availableSources.length > 0) {
      const warehouseSource = availableSources.find(
        (l) => l.type === "warehouse" || (l.type as string) === "godown"
      );
      setTargetLocationId(warehouseSource ? warehouseSource.id : availableSources[0].id);
    }
  }, [open, targetLocationId, availableSources]);

  // Load pharmacy medicines for autocomplete
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const fetchCatalog = async () => {
      try {
        const effectivePharmacyId = pharmacyId || (activeLocation as any)?.pharmacy_id;

        // Query available inventory medicines
        let query = supabase
          .from("medicines")
          .select(
            "id, name, generic_name, company_name, format, product_type, unit_format, strength, product_size, packaging_type, stock_quantity, location_id"
          )
          .order("name", { ascending: true })
          .limit(1000);

        if (effectivePharmacyId) {
          query = query.eq("pharmacy_id", effectivePharmacyId);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          if (isMounted) setMedicinesCatalog(data as CatalogMedicine[]);
          return;
        }

        if (error) {
          console.warn("[CreateRequisitionDialog] Catalog fetch notice:", error.message);
        }

        // Resilient fallback query: select all available medicines without restrictive fields
        const fallbackRes = await supabase
          .from("medicines")
          .select("*")
          .limit(1000);

        if (isMounted && fallbackRes.data && fallbackRes.data.length > 0) {
          setMedicinesCatalog(fallbackRes.data as CatalogMedicine[]);
        }
      } catch (err) {
        console.warn("[CreateRequisitionDialog] Error loading catalog:", err);
      }
    };

    fetchCatalog();

    return () => {
      isMounted = false;
    };
  }, [pharmacyId, activeLocation, open]);

  const handleAddItem = () => {
    setItems((prev) => [
      {
        medicine_name: "",
        requested_qty: 1,
        pack_unit: DEFAULT_UNIT,
        allowedUnits: DEFAULT_ALLOWED_UNITS,
      },
      ...prev,
    ]);
    setActiveDropdownIdx(0);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (activeDropdownIdx === index) {
      setActiveDropdownIdx(null);
    }
  };

  const handleSelectMedicine = (index: number, med: CatalogMedicine) => {
    const { allowedUnits, defaultUnit } = getUnitsForMedicine(med, med.name);
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        medicine_id: med.id,
        medicine_name: med.name,
        allowedUnits,
        pack_unit: defaultUnit,
      };
      return copy;
    });
    setActiveDropdownIdx(null);
  };

  const handleMedicineChange = (index: number, val: string) => {
    const cleanVal = val.trim().toLowerCase();
    const matched = medicinesCatalog.find(
      (m) => m.name.toLowerCase().trim() === cleanVal
    );

    const { allowedUnits, defaultUnit } = getUnitsForMedicine(matched, val);

    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        medicine_id: matched?.id || copy[index].medicine_id,
        medicine_name: val,
        allowedUnits,
        // Automatically set the mapped default unit when the medicine is selected
        pack_unit: defaultUnit,
      };
      return copy;
    });
  };

  const handleItemChange = (index: number, field: keyof RequisitionItemRow, value: any) => {
    if (field === "medicine_name") {
      handleMedicineChange(index, value);
      return;
    }

    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    if (!pharmacyId || !activeLocation?.id) {
      toast.error("Active location is required to submit a requisition demand");
      return;
    }

    if (!targetLocationId) {
      toast.error("Please select a supplying warehouse or branch");
      return;
    }

    if (items.length === 0) {
      toast.error("Please add at least one medicine to request");
      return;
    }

    // Programmatic JS Validation for every item row
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.medicine_name || !it.medicine_name.trim()) {
        toast.error(`Product Row #${i + 1}: Please specify a medicine or product name`);
        return;
      }
      const qty = Number(it.requested_qty);
      if (isNaN(qty) || qty <= 0) {
        toast.error(`Product Row #${i + 1} (${it.medicine_name}): Requested quantity must be at least 1`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const reqNum = `REQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      await warehouseStorage.saveBranchRequisition(
        pharmacyId,
        {
          from_branch_id: activeLocation.id,
          to_warehouse_id: targetLocationId,
          requisition_number: reqNum,
          status: "submitted",
          priority,
          notes: notes.trim() || null,
        },
        items.map((it) => {
          const matchedMed = medicinesCatalog.find(
            (m) => m.name.toLowerCase().trim() === it.medicine_name.toLowerCase().trim()
          );
          return {
            medicine_id: matchedMed?.id || it.medicine_id || null,
            medicine_name: it.medicine_name.trim(),
            requested_qty: Number(it.requested_qty) || 1,
            requested_quantity: Number(it.requested_qty) || 1,
            pack_unit: it.pack_unit || "Box",
          };
        })
      );

      toast.success(`Requisition ${reqNum} successfully submitted!`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Failed to save requisition:", err);
      toast.error(err.message || "Failed to submit requisition");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Boxes className="h-5 w-5 text-indigo-600" />
            Request Stock (Branch Requisition)
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Create an official multi-line replenishment demand for <strong>{activeLocation?.name}</strong>.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Target Location & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Supplying Location / Godown</Label>
              <Select value={targetLocationId} onValueChange={setTargetLocationId}>
                <SelectTrigger className="mt-1.5 rounded-xl text-xs bg-slate-50">
                  <SelectValue placeholder="Select warehouse or branch" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableSources.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id} className="text-xs">
                      {loc.name} ({loc.type === "warehouse" ? "Warehouse / Godown" : "Branch"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Priority Level</Label>
              <Select value={priority} onValueChange={(val: any) => setPriority(val)}>
                <SelectTrigger className="mt-1.5 rounded-xl text-xs bg-slate-50">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="normal" className="text-xs">Normal Replenishment</SelectItem>
                  <SelectItem value="urgent" className="text-xs font-semibold text-amber-600">Urgent Demand</SelectItem>
                  <SelectItem value="emergency" className="text-xs font-bold text-rose-600">Emergency Stockout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Line Items List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-slate-700">
                Requested Products ({items.length})
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="text-xs rounded-xl h-7 gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add Product Row
              </Button>
            </div>

            <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-slate-50 border border-slate-200/90 hover:border-slate-300 p-3 rounded-xl relative transition-all ${
                    activeDropdownIdx === idx ? "z-30 shadow-xs" : "z-10"
                  }`}
                >
                  {/* Top Line: Medicine Name with Custom Rich Autocomplete Dropdown */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[11px] font-medium text-slate-500">
                        Medicine Name {items.length > 1 && <span className="text-slate-400 font-normal">#{idx + 1}</span>}
                      </Label>
                    </div>
                    <Input
                      placeholder="Search or enter medicine (e.g. Napa Extra 500mg)"
                      value={item.medicine_name}
                      onFocus={() => setActiveDropdownIdx(idx)}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveDropdownIdx((curr) => (curr === idx ? null : curr));
                        }, 200);
                      }}
                      onChange={(e) => {
                        handleItemChange(idx, "medicine_name", e.target.value);
                        setActiveDropdownIdx(idx);
                      }}
                      className="h-9.5 rounded-xl text-xs bg-white w-full shadow-2xs"
                    />

                    {/* Custom Light-Themed Rich Autocomplete Dropdown */}
                    {activeDropdownIdx === idx && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {(() => {
                          const queryRaw = (item.medicine_name || "").trim().toLowerCase();
                          const queryNorm = normalizeForSearch(queryRaw);

                          const matches = medicinesCatalog
                            .filter((m) => {
                              if (!queryRaw) return true;
                              const nameLower = (m.name || "").toLowerCase();
                              const genLower = (m.generic_name || "").toLowerCase();
                              const compLower = (m.company_name || (m as any).company || "").toLowerCase();

                              // 1. Standard substring match
                              if (
                                nameLower.includes(queryRaw) ||
                                genLower.includes(queryRaw) ||
                                compLower.includes(queryRaw)
                              ) {
                                return true;
                              }

                              // 2. Normalized match (e.g. "atoz" matches "A-Z", "A to Z", etc.)
                              if (queryNorm) {
                                const normName = normalizeForSearch(m.name);
                                const normGen = normalizeForSearch(m.generic_name);
                                const normComp = normalizeForSearch(m.company_name || (m as any).company);
                                if (
                                  normName.includes(queryNorm) ||
                                  normGen.includes(queryNorm) ||
                                  normComp.includes(queryNorm)
                                ) {
                                  return true;
                                }
                              }

                              return false;
                            })
                            .slice(0, 10);

                          if (matches.length === 0) {
                            return (
                              <div className="p-3.5 text-center text-xs text-slate-500">
                                <p className="font-medium text-slate-700">No catalog matches found</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  You can continue typing "{item.medicine_name}" to request it as a custom item.
                                </p>
                              </div>
                            );
                          }

                          return matches.map((med) => {
                            // Safe data fallbacks
                            const companyName = med.company_name || (med as any).company || "Unknown Company";
                            const genericName = med.generic_name || null;
                            const stockAtSource = typeof med.stock_quantity === "number"
                              ? med.stock_quantity
                              : Number((med as any).stock) || 0;
                            const isAvailable = stockAtSource > 0;

                            return (
                              <button
                                type="button"
                                key={med.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectMedicine(idx, med);
                                }}
                                className="w-full text-left p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer group"
                              >
                                {/* Left Column: Product Info */}
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                                    {med.name || "Unnamed Medicine"}
                                    {(med.strength || med.product_size) && (
                                      <span className="font-normal text-slate-500 ml-1 text-xs">
                                        ({med.strength || med.product_size})
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                                    <span className="font-medium text-slate-700 truncate">
                                      {companyName}
                                    </span>
                                    {genericName && (
                                      <>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-slate-400 italic truncate">
                                          {genericName}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Right Column: Supplying Location Stock Badge */}
                                <div className="shrink-0 flex flex-col items-end">
                                  <span
                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                      isAvailable
                                        ? "text-indigo-700 bg-indigo-50 border border-indigo-100/80"
                                        : "text-rose-700 bg-rose-50 border border-rose-100/80"
                                    }`}
                                  >
                                    {isAvailable ? `${stockAtSource} in stock` : "0 in stock"}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mt-0.5">
                                    {supplyingLocation?.name ? `at ${supplyingLocation.name}` : "at source"}
                                  </span>
                                </div>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Bottom Line: Quantity, Unit Dropdown & Delete Button */}
                  <div className="flex items-center gap-2.5 mt-2.5">
                    {/* Quantity Input */}
                    <div className="flex-1">
                      <Label className="text-[11px] font-medium text-slate-500 mb-1 block">Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.requested_qty}
                        onChange={(e) => handleItemChange(idx, "requested_qty", Number(e.target.value))}
                        placeholder="Qty"
                        className="h-9 rounded-xl text-xs bg-white text-center"
                      />
                    </div>

                    {/* Unit Selector */}
                    <div className="flex-1">
                      <Label className="text-[11px] font-medium text-slate-500 mb-1 block">Unit</Label>
                      <Select
                        value={item.pack_unit}
                        onValueChange={(val) => handleItemChange(idx, "pack_unit", val)}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-xs bg-white capitalize">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {(item.allowedUnits || DEFAULT_ALLOWED_UNITS).map((unit) => (
                            <SelectItem key={unit} value={unit} className="text-xs">
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Delete Action Button */}
                    {items.length > 1 && (
                      <div className="self-end pb-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(idx)}
                          className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                          title="Remove product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Internal Notes / Instructions (Optional)</Label>
            <Textarea
              placeholder="e.g. Urgent stockout expected before evening shift..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 text-xs rounded-xl resize-none h-18 bg-slate-50"
            />
          </div>

          <DialogFooter className="pt-2">
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
              type="submit"
              size="sm"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-1.5 shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Submitting Demand...</span>
                </>
              ) : (
                <>
                  <Boxes className="h-3.5 w-3.5" />
                  <span>Submit Requisition Demand</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
