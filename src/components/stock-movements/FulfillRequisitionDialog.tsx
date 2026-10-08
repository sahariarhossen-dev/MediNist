import React, { useState, useEffect } from "react";
import { UnifiedStockMovement } from "@/types/stockMovement";
import { warehouseStorage } from "@/services/warehouseStorage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface FulfillRow {
  item_id?: string;
  medicine_id?: string;
  medicine_name: string;
  requested_qty: number;
  available_stock: number;
  dispatched_qty: number;
  pack_unit?: string;
}

interface FulfillRequisitionDialogProps {
  movement: UnifiedStockMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLocationId?: string | null;
  pharmacyId?: string | null;
  onSuccess: () => void;
}

export const FulfillRequisitionDialog: React.FC<FulfillRequisitionDialogProps> = ({
  movement,
  open,
  onOpenChange,
  activeLocationId,
  pharmacyId,
  onSuccess,
}) => {
  const { profile } = useAuth();
  const [rows, setRows] = useState<FulfillRow[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!movement || !open || !pharmacyId) return;

    const rawReq = movement.rawRequisition;
    const items = rawReq?.items || [];
    const supplyingLocId = activeLocationId || movement.toLocationId;

    const fetchWarehouseStock = async () => {
      setIsLoadingStock(true);
      try {
        const { data: medicines } = await supabase
          .from("medicines")
          .select("id, name, stock_quantity, location_id, generic_name, company_name, product_type, product_size, price, pcs_per_strip, strip_per_pack, box_size, pack_size")
          .eq("pharmacy_id", pharmacyId);

        const initialRows: FulfillRow[] = items.map((it: any) => {
          const reqQty = Number(it.requested_qty || it.requested_quantity || 1);
          const cleanName = (it.medicine_name || "").toLowerCase().trim();

          // Resolve supplying warehouse medicine record
          const matchedMed =
            medicines?.find(
              (m) =>
                ((it.medicine_id && m.id === it.medicine_id) || m.name.toLowerCase().trim() === cleanName) &&
                (m.location_id === supplyingLocId || !m.location_id)
            ) ||
            medicines?.find((m) => it.medicine_id && m.id === it.medicine_id) ||
            medicines?.find((m) => m.name.toLowerCase().trim() === cleanName);

          const avail = matchedMed ? Number(matchedMed.stock_quantity) || 0 : 0;
          const resolvedMedId = matchedMed?.id || it.medicine_id || undefined;

          return {
            item_id: it.id,
            medicine_id: resolvedMedId,
            medicine_name: it.medicine_name,
            requested_qty: reqQty,
            available_stock: avail,
            dispatched_qty: reqQty,
            pack_unit: it.pack_unit || "Box",
          };
        });

        setRows(initialRows);
      } catch (err) {
        console.warn("Error fetching warehouse stock for fulfillment:", err);
      } finally {
        setIsLoadingStock(false);
      }
    };

    fetchWarehouseStock();
  }, [movement, open, pharmacyId, activeLocationId]);

  const handleQtyChange = (idx: number, val: number) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], dispatched_qty: val };
      return copy;
    });
  };

  const handleFulfill = async () => {
    if (!movement?.rawRequisition || !pharmacyId) return;

    for (const r of rows) {
      if (r.dispatched_qty < 0) {
        toast.error(`Invalid dispatched quantity for ${r.medicine_name}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const reqId = movement.rawRequisition.id;
      const supplyingLocId = activeLocationId || movement.toLocationId;
      const receivingLocId = movement.fromLocationId;

      let totalDispatched = 0;
      const itemsPayloadForDispatch: {
        item_id?: string;
        medicine_id?: string;
        medicine_name: string;
        dispatched_qty: number;
        pack_unit?: string;
      }[] = [];

      for (const r of rows) {
        const qty = Number(r.dispatched_qty) || 0;
        if (qty <= 0) continue;
        totalDispatched += qty;

        // 1. Resolve medicine at supplying warehouse
        let targetMed: any = null;
        if (r.medicine_id) {
          const { data } = await supabase
            .from("medicines")
            .select("*")
            .eq("id", r.medicine_id)
            .maybeSingle();
          targetMed = data;
        }

        if (!targetMed) {
          const { data: list } = await supabase
            .from("medicines")
            .select("*")
            .eq("pharmacy_id", pharmacyId)
            .ilike("name", r.medicine_name.trim());

          targetMed =
            list?.find((m) => m.location_id === supplyingLocId) ||
            list?.find((m) => !m.location_id) ||
            list?.[0];
        }

        // 2. Perform Stock Deduction at supplying warehouse
        if (targetMed) {
          const currentStock = Number(targetMed.stock_quantity) || 0;
          const newStock = Math.max(0, currentStock - qty);
          const { error: deductErr } = await supabase
            .from("medicines")
            .update({ stock_quantity: newStock })
            .eq("id", targetMed.id);

          if (deductErr) {
            throw new Error(`Failed to deduct stock for ${r.medicine_name}: ${deductErr.message}`);
          }
        } else {
          console.warn(
            `[FulfillRequisition] Medicine ${r.medicine_name} record not found at supplying branch; proceeding with dispatch record.`
          );
        }

        // 3. Generate corresponding stock_transfers record (Delivery Challan)
        try {
          await supabase.from("stock_transfers" as any).insert({
            pharmacy_id: pharmacyId,
            from_location_id: supplyingLocId,
            to_location_id: receivingLocId,
            medicine_id: targetMed?.id || r.medicine_id || null,
            medicine_name: r.medicine_name,
            generic_name: targetMed?.generic_name || null,
            dosage: targetMed?.product_size || null,
            quantity: qty,
            unit: r.pack_unit || "Box",
            status: "pending",
            note: `Auto-generated delivery challan for Requisition ${movement.referenceNumber}`,
            created_by: profile?.id || null,
          });
        } catch (transErr) {
          console.warn("[FulfillRequisition] Note: Could not insert linked stock_transfers record:", transErr);
        }

        itemsPayloadForDispatch.push({
          item_id: r.item_id,
          medicine_id: targetMed?.id || r.medicine_id,
          medicine_name: r.medicine_name,
          dispatched_qty: qty,
          pack_unit: r.pack_unit || "Box",
        });
      }

      if (totalDispatched === 0) {
        toast.error("Please specify at least one positive dispatched quantity to fulfill.");
        return;
      }

      // 4. Persist dispatched_qty on requisition items and update status to 'dispatched'
      await warehouseStorage.dispatchBranchRequisition(
        pharmacyId,
        reqId,
        itemsPayloadForDispatch
      );

      toast.success(
        `Requisition ${movement.referenceNumber} fulfilled! Delivery Challan dispatched.`
      );

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Fulfillment execution error:", err);
      toast.error(err.message || "Failed to process fulfillment dispatch");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Truck className="h-5 w-5 text-indigo-600" />
            Fulfill & Dispatch Requisition: {movement?.referenceNumber}
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Fulfill replenishment request submitted by <strong>{movement?.fromLocationName}</strong>.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {isLoadingStock ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-500" />
              Verifying warehouse inventory levels...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                <div className="bg-slate-50 p-2.5 grid grid-cols-12 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span className="col-span-5">Product</span>
                  <span className="col-span-2 text-center">Req</span>
                  <span className="col-span-2 text-center">In Stock</span>
                  <span className="col-span-3 text-right">Dispatch Qty</span>
                </div>

                {rows.map((row, idx) => (
                  <div key={idx} className="p-2.5 grid grid-cols-12 items-center text-xs">
                    <div className="col-span-5 pr-2">
                      <span className="font-semibold text-slate-800 block truncate">
                        {row.medicine_name}
                      </span>
                    </div>

                    <div className="col-span-2 text-center text-slate-600 font-medium">
                      {row.requested_qty}
                    </div>

                    <div className="col-span-2 text-center">
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          row.available_stock >= row.requested_qty
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {row.available_stock}
                      </span>
                    </div>

                    <div className="col-span-3 flex justify-end">
                      <Input
                        type="number"
                        min={0}
                        max={row.available_stock}
                        value={row.dispatched_qty}
                        onChange={(e) => handleQtyChange(idx, Number(e.target.value))}
                        className="h-8 w-20 text-right text-xs rounded-lg"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {movement?.notes && (
                <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-xs text-amber-800">
                  <span className="font-semibold block mb-0.5">Requester Notes:</span>
                  {movement.notes}
                </div>
              )}
            </div>
          )}
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
            type="button"
            size="sm"
            disabled={isSubmitting || isLoadingStock || rows.length === 0}
            onClick={handleFulfill}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-1.5 shadow-xs"
          >
            {isSubmitting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve & Dispatch Delivery Challan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
