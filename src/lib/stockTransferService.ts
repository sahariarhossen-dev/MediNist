import { supabase } from "@/integrations/supabase/client";
import { Location, StockTransfer } from "@/types/location";
import { resolveLocation } from "@/lib/multiLocationStock";

export interface TransferExecutionResult {
  success: boolean;
  message: string;
  transfer?: StockTransfer;
}

/**
 * Checks if a medicine's location_id matches a target location by id, code, or name.
 */
function matchesLocation(
  rowLocationId: string | null | undefined,
  targetLocationId: string | null | undefined,
  locations: Location[] = []
): boolean {
  if (!rowLocationId || !targetLocationId) return false;
  const rowLoc = rowLocationId.trim().toLowerCase();
  const targetLoc = targetLocationId.trim().toLowerCase();
  if (rowLoc === targetLoc) return true;

  // Check target location in locations registry
  const matchedTarget = locations.find(
    (l) =>
      (l.id && l.id.toLowerCase() === targetLoc) ||
      (l.code && l.code.toLowerCase() === targetLoc) ||
      (l.name && l.name.toLowerCase() === targetLoc)
  );
  if (matchedTarget) {
    if (matchedTarget.id && matchedTarget.id.toLowerCase() === rowLoc) return true;
    if (matchedTarget.code && matchedTarget.code.toLowerCase() === rowLoc) return true;
    if (matchedTarget.name && matchedTarget.name.toLowerCase() === rowLoc) return true;
  }

  // Check row location in locations registry
  const matchedRow = locations.find(
    (l) =>
      (l.id && l.id.toLowerCase() === rowLoc) ||
      (l.code && l.code.toLowerCase() === rowLoc) ||
      (l.name && l.name.toLowerCase() === rowLoc)
  );
  if (matchedRow) {
    if (matchedRow.id && matchedRow.id.toLowerCase() === targetLoc) return true;
    if (matchedRow.code && matchedRow.code.toLowerCase() === targetLoc) return true;
    if (matchedRow.name && matchedRow.name.toLowerCase() === targetLoc) return true;
  }

  return false;
}

/**
 * Retroactively syncs and reconciles already accepted transfers to ensure the receiving
 * branch (e.g. City Pharmacy) has a valid inventory record credited with the transferred quantity.
 * This operation is strictly idempotent.
 */
export async function reconcileAcceptedTransfers(
  pharmacyId: string,
  locations: Location[] = [],
  medicineNameFilter?: string
): Promise<{ reconciledCount: number }> {
  if (!pharmacyId) return { reconciledCount: 0 };

  let reconciledCount = 0;
  try {
    let query = supabase
      .from("stock_transfers" as any)
      .select("*")
      .eq("pharmacy_id", pharmacyId)
      .in("status", ["accepted", "Accepted"]);

    if (medicineNameFilter && medicineNameFilter.trim()) {
      query = query.ilike("medicine_name", medicineNameFilter.trim());
    }

    const { data: acceptedTransfers, error } = await query;
    if (error || !acceptedTransfers || acceptedTransfers.length === 0) {
      return { reconciledCount: 0 };
    }

    for (const transfer of acceptedTransfers) {
      const toBranchId = transfer.to_location_id || (transfer as any).to_branch_id;
      const transferQty = Number(transfer.quantity) || 0;
      const medName = (transfer.medicine_name || "").trim();

      if (!toBranchId || !medName || transferQty <= 0) continue;

      // Resolve canonical location if possible
      const resolvedLoc = resolveLocation(toBranchId, locations);
      const targetLocId = resolvedLoc?.id || toBranchId;

      // Check if destination branch has an inventory record in 'medicines'
      const { data: destRecords, error: destErr } = await supabase
        .from("medicines")
        .select("*")
        .eq("pharmacy_id", pharmacyId)
        .eq("location_id", targetLocId)
        .ilike("name", medName);

      // Also fetch origin medicine info to copy metadata if insertion is needed
      let originMed: any = null;
      if (transfer.medicine_id) {
        const { data: byId } = await supabase
          .from("medicines")
          .select("*")
          .eq("id", transfer.medicine_id)
          .maybeSingle();
        originMed = byId;
      }
      if (!originMed) {
        const { data: byName } = await supabase
          .from("medicines")
          .select("*")
          .eq("pharmacy_id", pharmacyId)
          .ilike("name", medName)
          .limit(1);
        originMed = byName?.[0];
      }

      if (!destErr && (!destRecords || destRecords.length === 0)) {
        // Record does NOT exist for destination branch: INSERT new record
        const newRecordPayload: any = {
          pharmacy_id: pharmacyId,
          location_id: targetLocId,
          name: originMed?.name || medName,
          generic_name: originMed?.generic_name || transfer.generic_name || null,
          company_name: originMed?.company_name || null,
          product_type: originMed?.product_type || "Tablet",
          product_size: originMed?.product_size || transfer.dosage || null,
          unit_format: originMed?.unit_format || null,
          format: originMed?.format || null,
          strength: originMed?.strength || null,
          price: (transfer as any).selling_price || originMed?.price || 0,
          stock_quantity: transferQty,
          stock_alert: originMed?.stock_alert || 0,
          pcs_per_strip: originMed?.pcs_per_strip || 1,
          strip_per_pack: originMed?.strip_per_pack || 1,
          box_size: originMed?.box_size || null,
          pack_size: originMed?.pack_size || null,
          expiry_date: (transfer as any).expiry_date || originMed?.expiry_date || null,
        };

        const { error: insErr } = await supabase.from("medicines").insert(newRecordPayload);
        if (!insErr) {
          reconciledCount++;
        }
      } else if (destRecords && destRecords.length > 0) {
        // Record exists: check if stock is 0 (i.e. was never credited)
        const firstRecord = destRecords[0];
        const currentStock = Number(firstRecord.stock_quantity) || 0;
        if (currentStock === 0) {
          const { error: updErr } = await supabase
            .from("medicines")
            .update({ stock_quantity: transferQty })
            .eq("id", firstRecord.id);
          if (!updErr) {
            reconciledCount++;
          }
        }
      }
    }

    if (reconciledCount > 0 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("inventory-updated", {
          detail: {
            timestamp: Date.now(),
            reconciledCount,
            medicineName: medicineNameFilter,
          },
        })
      );
    }
  } catch (err) {
    console.warn("[stockTransferService] Error during reconcileAcceptedTransfers:", err);
  }

  return { reconciledCount };
}

/**
 * Accepts a stock transfer.
 * Deducts from source branch and credits destination branch:
 * - If record exists for destination branch: increments stock (stock = current_stock + transfer_quantity).
 * - If record does not exist: inserts a new record into the inventory table with transfer metadata.
 */
export async function processAcceptTransfer(
  transferId: string,
  pharmacyId?: string,
  currentUserId?: string,
  cachedTransfer?: StockTransfer,
  locations: Location[] = []
): Promise<TransferExecutionResult> {
  if (!transferId) {
    throw new Error("Missing transfer ID");
  }

  // 1. Retrieve the full transfer record
  let transfer: any = cachedTransfer;
  if (!transfer || !transfer.pharmacy_id) {
    const { data: fetchedTransfer, error: fetchErr } = await supabase
      .from("stock_transfers" as any)
      .select("*")
      .eq("id", transferId)
      .maybeSingle();

    if (!fetchErr && fetchedTransfer) {
      transfer = fetchedTransfer;
    }
  }

  const effPharmacyId = transfer?.pharmacy_id || pharmacyId;
  const fromBranchId = transfer?.from_location_id || transfer?.from_branch_id;
  const toBranchId = transfer?.to_location_id || transfer?.to_branch_id;
  const transferQty = Number(transfer?.quantity) || 0;
  const medName = (transfer?.medicine_name || "").trim();
  const medId = transfer?.medicine_id;

  // Try database RPC first if available
  let rpcSucceeded = false;
  try {
    const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)(
      "process_stock_transfer",
      {
        _transfer_id: transferId,
      }
    );
    if (!rpcError) {
      rpcSucceeded = true;
    } else {
      console.warn("[stockTransferService] RPC returned error, using direct application credit logic:", rpcError);
    }
  } catch (err) {
    console.warn("[stockTransferService] RPC failed to execute, falling back to direct application credit logic:", err);
  }

  // If RPC did not execute or needs direct stock assurance
  if (effPharmacyId && toBranchId && medName && transferQty > 0) {
    // A. Deduct strictly from source branch (from_branch_id)
    // CRITICAL: Retain the source branch's record. DO NOT change the location_id of the origin row.
    // Strictly update stock_quantity (deduction).
    let originMed: any = null;
    if (fromBranchId) {
      const resolvedFrom = resolveLocation(fromBranchId, locations);
      const fromLocId = resolvedFrom?.id || fromBranchId;

      // Find origin medicine strictly within the source location
      const { data: originMeds } = await supabase
        .from("medicines")
        .select("*")
        .eq("pharmacy_id", effPharmacyId)
        .eq("location_id", fromLocId)
        .ilike("name", medName);

      if (medId) {
        originMed = originMeds?.find((m) => m.id === medId) || originMeds?.[0];
      } else {
        originMed = originMeds?.[0];
      }

      // If no row found with explicit location_id, check if medicine_id directly matches
      if (!originMed && medId) {
        const { data: directOrigin } = await supabase
          .from("medicines")
          .select("*")
          .eq("pharmacy_id", effPharmacyId)
          .eq("id", medId)
          .maybeSingle();
        originMed = directOrigin;
      }

      if (originMed && !rpcSucceeded) {
        const currentOriginStock = Number(originMed.stock_quantity) || 0;
        const newOriginStock = Math.max(0, currentOriginStock - transferQty);
        // Retain origin row and its location_id; strictly mutate only stock_quantity
        await supabase
          .from("medicines")
          .update({ stock_quantity: newOriginStock })
          .eq("id", originMed.id);
      }
    }

    // B. Check & credit destination branch (to_branch_id)
    // Execute an idempotent UPSERT for the destination branch (increment if exists, insert new if it does not)
    const resolvedDest = resolveLocation(toBranchId, locations);
    const destLocId = resolvedDest?.id || toBranchId;

    const { data: existingDestRows } = await supabase
      .from("medicines")
      .select("*")
      .eq("pharmacy_id", effPharmacyId)
      .eq("location_id", destLocId)
      .ilike("name", medName);

    const targetDosage = (transfer?.dosage || originMed?.product_size || "").toLowerCase().trim();
    const destMed =
      targetDosage && existingDestRows && existingDestRows.length > 1
        ? existingDestRows.find(
            (m) => (m.product_size || "").toLowerCase().trim() === targetDosage
          ) || existingDestRows[0]
        : existingDestRows?.[0];

    if (destMed) {
      // Record exists: update and increment stock
      if (!rpcSucceeded || (Number(destMed.stock_quantity) || 0) === 0) {
        const currentStock = Number(destMed.stock_quantity) || 0;
        const updatedStock = currentStock + transferQty;
        await supabase
          .from("medicines")
          .update({ stock_quantity: updatedStock })
          .eq("id", destMed.id);
      }
    } else {
      // Record DOES NOT exist: INSERT brand new record for destination branch
      const insertPayload: any = {
        pharmacy_id: effPharmacyId,
        location_id: destLocId,
        branch_id: destLocId,
        name: originMed?.name || medName,
        generic_name: originMed?.generic_name || transfer?.generic_name || null,
        company_name: originMed?.company_name || null,
        product_type: originMed?.product_type || "Tablet",
        product_size: originMed?.product_size || transfer?.dosage || null,
        unit_format: originMed?.unit_format || null,
        format: originMed?.format || null,
        strength: originMed?.strength || null,
        price: (transfer as any)?.selling_price || originMed?.price || 0,
        stock_quantity: transferQty,
        stock_alert: originMed?.stock_alert || 0,
        pcs_per_strip: originMed?.pcs_per_strip || 1,
        strip_per_pack: originMed?.strip_per_pack || 1,
        box_size: originMed?.box_size || null,
        pack_size: originMed?.pack_size || null,
        expiry_date: (transfer as any)?.expiry_date || originMed?.expiry_date || null,
      };

      await supabase.from("medicines").insert(insertPayload);
    }

    // Also support any supplementary 'inventory' table schema if present
    try {
      const { data: invRows } = await supabase
        .from("inventory" as any)
        .select("*")
        .eq("branch_id", destLocId)
        .eq("medicine_id", medId || originMed?.id);

      if (invRows && invRows.length > 0) {
        const currentInvStock = Number(invRows[0].stock) || 0;
        await supabase
          .from("inventory" as any)
          .update({ stock: currentInvStock + transferQty })
          .eq("id", invRows[0].id);
      } else {
        await supabase
          .from("inventory" as any)
          .insert({
            branch_id: destLocId,
            medicine_id: medId || originMed?.id,
            stock: transferQty,
            batch_number: (transfer as any)?.batch_number || null,
            expiry_date: (transfer as any)?.expiry_date || null,
            purchase_price: (transfer as any)?.purchase_price || 0,
            selling_price: (transfer as any)?.selling_price || originMed?.price || 0,
          });
      }
    } catch {
      // Supplementary 'inventory' table not present, safely ignore
    }

    // Mark transfer status as accepted in Supabase
    await supabase
      .from("stock_transfers" as any)
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: currentUserId || null,
      })
      .eq("id", transferId);
  }

  // Reactive event for all listeners
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("inventory-updated", {
        detail: {
          timestamp: Date.now(),
          transferId,
          medicineName: medName,
          quantity: transferQty,
          toLocationId: toBranchId,
        },
      })
    );
  }

  return {
    success: true,
    message: "Transfer accepted and stock updated safely.",
  };
}

/**
 * Queries live stock distribution across all registered locations for a medicine.
 */
export async function fetchLiveMedicineDistribution(
  pharmacyId: string,
  medicineName: string,
  locations: Location[],
  fallbackDistribution?: any[],
  fallbackStockQty?: number
): Promise<{
  totalPieces: number;
  breakdown: Array<{ location: Location; qty: number; percent: number }>;
}> {
  if (!pharmacyId || !medicineName || !locations || locations.length === 0) {
    return {
      totalPieces: fallbackStockQty || 0,
      breakdown: [],
    };
  }

  const cleanMedName = medicineName.trim();

  // 1. Reconcile any accepted transfers for this medicine so receiving branches are credited
  try {
    await reconcileAcceptedTransfers(pharmacyId, locations, cleanMedName);
  } catch (err) {
    console.warn("[stockTransferService] Error reconciling transfers for distribution:", err);
  }

  const locationQtyMap = new Map<string, number>();
  locations.forEach((loc) => locationQtyMap.set(loc.id, 0));

  try {
    // Query actual columns from medicines (avoid querying non-existent columns like stock_distribution)
    const { data: rows, error } = await supabase
      .from("medicines")
      .select("id, name, location_id, stock_quantity, price, expiry_date, generic_name, product_size")
      .eq("pharmacy_id", pharmacyId)
      .ilike("name", cleanMedName);

    if (!error && rows && rows.length > 0) {
      for (const row of rows) {
        // If row has location_id
        if (row.location_id) {
          const loc = resolveLocation(row.location_id, locations);
          if (loc) {
            const current = locationQtyMap.get(loc.id) || 0;
            locationQtyMap.set(loc.id, current + (Number(row.stock_quantity) || 0));
          }
        }
      }
    } else if (Array.isArray(fallbackDistribution) && fallbackDistribution.length > 0) {
      for (const item of fallbackDistribution) {
        const loc = resolveLocation(item.location_id, locations);
        if (loc) {
          locationQtyMap.set(loc.id, Number(item.qty) || 0);
        }
      }
    }
  } catch (err) {
    console.warn("[stockTransferService] Error fetching live distribution:", err);
  }

  // Calculate total and build sorted breakdown
  let totalPieces = 0;
  for (const qty of locationQtyMap.values()) {
    totalPieces += qty;
  }

  const breakdown: Array<{ location: Location; qty: number; percent: number }> = [];

  for (const loc of locations) {
    const qty = locationQtyMap.get(loc.id) || 0;
    const percent = totalPieces > 0 ? Math.round((qty / totalPieces) * 100) : 0;
    breakdown.push({
      location: loc,
      qty,
      percent,
    });
  }

  // Sort locations: branches first, then warehouses; non-zero stock first
  breakdown.sort((a, b) => {
    if (a.qty > 0 && b.qty === 0) return -1;
    if (a.qty === 0 && b.qty > 0) return 1;
    if (a.location.type !== b.location.type) {
      return a.location.type === "branch" ? -1 : 1;
    }
    return b.qty - a.qty;
  });

  return {
    totalPieces,
    breakdown,
  };
}

