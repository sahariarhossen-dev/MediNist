import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { warehouseStorage } from "@/services/warehouseStorage";
import {
  UnifiedStockMovement,
  StockMovementsSummary,
  UnifiedMovementStatus,
} from "@/types/stockMovement";
import { BranchRequisition } from "@/types/warehouseErp";
import { StockTransfer } from "@/types/location";
import { toast } from "sonner";

export function useStockMovements() {
  const { profile } = useAuth();
  const {
    locations,
    activeLocation,
    transfers,
    fetchTransfers,
    acceptTransfer: acceptTransferFromStore,
    rejectTransfer: rejectTransferFromStore,
  } = useLocationStore();

  const pharmacyId = profile?.pharmacy_id;
  const activeLocationId = activeLocation?.id;

  const [requisitions, setRequisitions] = useState<BranchRequisition[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Helper to look up location name
  const getLocationName = useCallback(
    (locId?: string | null, fallback = "Unknown Location") => {
      if (!locId) return fallback;
      const found = locations.find((l) => l.id === locId);
      return found ? found.name : fallback;
    },
    [locations]
  );

  // Fetch branch requisitions scoped to active location
  const fetchRequisitions = useCallback(async () => {
    if (!pharmacyId) return;
    try {
      const reqs = await warehouseStorage.getBranchRequisitions(
        pharmacyId,
        activeLocationId
      );
      setRequisitions((reqs as any) || []);
    } catch (err: any) {
      console.warn("[useStockMovements] Error fetching requisitions:", err?.message || err);
    }
  }, [pharmacyId, activeLocationId]);

  // Unified refetch
  const refetchAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        fetchRequisitions(),
        fetchTransfers ? fetchTransfers() : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [fetchRequisitions, fetchTransfers]);

  useEffect(() => {
    setIsLoading(true);
    refetchAll();
  }, [refetchAll]);

  // Reactive listener to custom window events (e.g., inventory updates)
  useEffect(() => {
    const handleInventoryUpdated = () => {
      refetchAll();
    };
    window.addEventListener("inventory-updated", handleInventoryUpdated);
    return () => {
      window.removeEventListener("inventory-updated", handleInventoryUpdated);
    };
  }, [refetchAll]);

  // Normalize Requisitions into Unified Movements
  const normalizedRequisitions = useMemo<UnifiedStockMovement[]>(() => {
    if (!activeLocationId) return [];

    return requisitions
      .filter((req) => {
        const fromId = req.from_branch_id || (req as any).from_location_id;
        const toId = req.to_warehouse_id || (req as any).to_location_id;
        return fromId === activeLocationId || toId === activeLocationId;
      })
      .map((req) => {
        const fromId = req.from_branch_id || (req as any).from_location_id;
        const toId = req.to_warehouse_id || (req as any).to_location_id;
        const isRequester = fromId === activeLocationId;
        const isFulfiller = toId === activeLocationId;

        // Relative direction
        const direction = isRequester ? "inbound" : "outbound";

        // Map status
        const rawStatus = (req.status || "").toLowerCase();
        let status: UnifiedMovementStatus = "pending";
        if (rawStatus === "dispatched" || rawStatus === "partially_fulfilled") {
          status = "dispatched";
        } else if (rawStatus === "completed" || rawStatus === "fulfilled") {
          status = "completed";
        } else if (rawStatus === "rejected") {
          status = "rejected";
        } else if (rawStatus === "cancelled") {
          status = "cancelled";
        }

        const isPending = status === "pending";
        const isDispatched = status === "dispatched";

        const itemsPreview = (req.items || []).map((it) => ({
          id: it.id,
          name: it.medicine_name,
          quantity:
            Number(
              it.dispatched_qty ||
                it.approved_qty ||
                it.requested_qty ||
                (it as any).requested_quantity ||
                1
            ) || 1,
          unit: "pack",
          dispatchedQty: it.dispatched_qty,
          receivedQty: (it as any).received_qty,
        }));

        const totalQuantity = itemsPreview.reduce((sum, item) => sum + item.quantity, 0);

        return {
          id: req.id,
          sourceType: "requisition",
          referenceNumber: req.requisition_number,
          createdAt: req.created_at,
          updatedAt: req.updated_at,
          direction,
          fromLocationId: fromId,
          fromLocationName: getLocationName(fromId, "Requesting Branch"),
          toLocationId: toId,
          toLocationName: getLocationName(toId, "Supplying Location"),
          status,
          rawStatus: req.status,
          priority: req.priority || "normal",
          totalItemsCount: req.items?.length || 0,
          totalQuantity,
          itemsPreview,
          notes: req.notes || undefined,
          canFulfill: isPending && isFulfiller && !isRequester,
          canReceive: isDispatched && isRequester,
          canCancel: isPending && isRequester,
          canReject: isPending && isFulfiller && !isRequester,
          rawRequisition: req,
        };
      });
  }, [requisitions, activeLocationId, getLocationName]);

  // Helper to extract or generate group key for transfers
  const getTransferGroupKey = useCallback((tr: StockTransfer): string => {
    // 1. Explicit batch reference number
    if (tr.reference_number && tr.reference_number.startsWith("TR-BATCH-")) {
      return tr.reference_number;
    }

    // 2. Embedded [Ref: ...] or TR-BATCH- in note
    const noteStr = tr.note || "";
    const match =
      noteStr.match(/\[(?:Ref|Batch):\s*([A-Za-z0-9\-_]+)\]/i) ||
      noteStr.match(/\b(TR-BATCH-[A-Za-z0-9\-_]+)\b/i);
    if (match) return match[1];

    // 3. Cluster multi-items created together within the same timestamp bucket
    if (tr.created_at) {
      const timeMs = new Date(tr.created_at).getTime();
      const timeBucket = Math.floor(timeMs / 10000); // 10-second cluster window
      return `CLUSTER-${tr.from_location_id}-${tr.to_location_id}-${timeBucket}`;
    }

    return tr.reference_number || `TR-${tr.id.slice(0, 6).toUpperCase()}`;
  }, []);

  // Normalize Direct Stock Transfers into Unified Movements (Grouped by Batch Reference)
  const normalizedTransfers = useMemo<UnifiedStockMovement[]>(() => {
    if (!activeLocationId || !transfers) return [];

    const eligibleTransfers = transfers.filter((tr) => {
      // Exclude auto-generated challans spawned by requisitions to prevent double-counting
      if (tr.note && tr.note.toLowerCase().includes("auto-generated from requisition")) {
        return false;
      }

      const isReceiver = tr.to_location_id === activeLocationId;
      const isSender = tr.from_location_id === activeLocationId;
      return isReceiver || isSender;
    });

    // Group transfers by unified batch key
    const groups = new Map<string, StockTransfer[]>();
    for (const tr of eligibleTransfers) {
      const key = getTransferGroupKey(tr);
      const existing = groups.get(key);
      if (existing) {
        existing.push(tr);
      } else {
        groups.set(key, [tr]);
      }
    }

    const unifiedList: UnifiedStockMovement[] = [];

    groups.forEach((batchTransfers) => {
      if (batchTransfers.length === 0) return;
      const firstTr = batchTransfers[0];
      const isReceiver = firstTr.to_location_id === activeLocationId;
      const direction = isReceiver ? "inbound" : "outbound";

      // Status aggregation:
      // If any is pending, the movement requires action (pending)
      // If all are accepted, completed
      // If all are rejected, rejected
      const hasPending = batchTransfers.some(
        (t) => (t.status || "").toLowerCase() === "pending"
      );
      const hasRejected = batchTransfers.every(
        (t) => (t.status || "").toLowerCase() === "rejected"
      );

      let status: UnifiedMovementStatus = "pending";
      if (!hasPending) {
        if (hasRejected) {
          status = "rejected";
        } else {
          status = "completed";
        }
      }

      const isPending = status === "pending";

      // Transform items for preview strip and manifest
      const itemsPreview = batchTransfers.map((tr) => ({
        id: tr.medicine_id || tr.id,
        name: tr.medicine_name,
        quantity: Number(tr.quantity) || 1,
        unit: tr.unit || "pcs",
      }));

      const totalQuantity = itemsPreview.reduce((sum, it) => sum + it.quantity, 0);

      // Determine display reference number
      let displayRef = firstTr.reference_number;
      if (!displayRef || !displayRef.startsWith("TR-")) {
        const noteMatch =
          (firstTr.note || "").match(/\[(?:Ref|Batch):\s*([A-Za-z0-9\-_]+)\]/i) ||
          (firstTr.note || "").match(/\b(TR-BATCH-[A-Za-z0-9\-_]+)\b/i);
        if (noteMatch) {
          displayRef = noteMatch[1];
        } else if (batchTransfers.length > 1) {
          displayRef = `TR-BATCH-${firstTr.id.slice(0, 6).toUpperCase()}`;
        } else {
          displayRef = `TR-${firstTr.id.slice(0, 6).toUpperCase()}`;
        }
      }

      // Strip internal [Ref: ...] prefix from notes for clean UI presentation
      const cleanNote = firstTr.note
        ? firstTr.note.replace(/\[(?:Ref|Batch):\s*([A-Za-z0-9\-_]+)\]\s*/i, "").trim()
        : undefined;

      unifiedList.push({
        id: displayRef || firstTr.id,
        sourceType: "direct_transfer",
        referenceNumber: displayRef,
        createdAt: firstTr.created_at || firstTr.date,
        direction,
        fromLocationId: firstTr.from_location_id,
        fromLocationName: firstTr.from_location_name || getLocationName(firstTr.from_location_id),
        toLocationId: firstTr.to_location_id,
        toLocationName: firstTr.to_location_name || getLocationName(firstTr.to_location_id),
        status,
        rawStatus: firstTr.status,
        priority: "normal",
        totalItemsCount: batchTransfers.length,
        totalQuantity,
        itemsPreview,
        notes: cleanNote || firstTr.note || undefined,
        canFulfill: false, // direct transfers are already dispatched upon creation
        canReceive: isPending && isReceiver,
        canCancel: false,
        canReject: isPending && isReceiver,
        rawTransfer: firstTr,
        rawTransfers: batchTransfers,
      });
    });

    return unifiedList;
  }, [transfers, activeLocationId, getLocationName, getTransferGroupKey]);

  // Combine and sort chronologically (most recent first)
  const allMovements = useMemo<UnifiedStockMovement[]>(() => {
    const combined = [...normalizedRequisitions, ...normalizedTransfers];
    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [normalizedRequisitions, normalizedTransfers]);

  // Inbound & Outbound filtered subsets
  const inboundMovements = useMemo(
    () => allMovements.filter((m) => m.direction === "inbound"),
    [allMovements]
  );

  const outboundMovements = useMemo(
    () => allMovements.filter((m) => m.direction === "outbound"),
    [allMovements]
  );

  // Summary Metrics
  const summary = useMemo<StockMovementsSummary>(() => {
    return {
      total: allMovements.length,
      inboundTotal: inboundMovements.length,
      inboundActionRequired: inboundMovements.filter(
        (m) => m.status === "dispatched" || (m.sourceType === "direct_transfer" && m.status === "pending")
      ).length,
      outboundTotal: outboundMovements.length,
      outboundActionRequired: outboundMovements.filter(
        (m) => m.sourceType === "requisition" && m.status === "pending"
      ).length,
      completedTotal: allMovements.filter((m) => m.status === "completed").length,
    };
  }, [allMovements, inboundMovements, outboundMovements]);

  // Action: Receive Requisition Delivery
  const handleReceiveRequisitionDelivery = async (movement: UnifiedStockMovement) => {
    if (!pharmacyId || !activeLocationId || !movement.rawRequisition) return;
    setActionInProgressId(movement.id);
    try {
      const result = await warehouseStorage.receiveRequisitionDelivery(
        pharmacyId,
        movement.rawRequisition.id,
        activeLocationId,
        movement.referenceNumber,
        profile?.id,
        locations
      );

      if (!result?.success || result.transfersProcessed === 0) {
        throw new Error("Inventory verification failed. Stock could not be confirmed.");
      }

      // Optimistic update ONLY upon successful inventory credit
      setRequisitions((prev) =>
        prev.map((r) =>
          r.id === movement.rawRequisition?.id
            ? { ...r, status: "completed" as any, received_at: new Date().toISOString() }
            : r
        )
      );

      toast.success(
        `Delivery ${movement.referenceNumber} received! Stock successfully credited to ${activeLocation?.name}.`
      );

      refetchAll();
    } catch (err: any) {
      console.error("[useStockMovements] Error receiving delivery:", err);
      toast.error(err.message || "Failed to receive delivery");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Action: Accept Direct Transfer (Batch)
  const handleAcceptDirectTransfer = async (movement: UnifiedStockMovement) => {
    const transfersToProcess =
      movement.rawTransfers && movement.rawTransfers.length > 0
        ? movement.rawTransfers
        : movement.rawTransfer
        ? [movement.rawTransfer]
        : [];

    if (transfersToProcess.length === 0) return;
    setActionInProgressId(movement.id);

    try {
      let acceptedCount = 0;
      for (const tr of transfersToProcess) {
        if ((tr.status || "").toLowerCase() === "pending") {
          await acceptTransferFromStore(tr.id);
          acceptedCount++;
        }
      }

      toast.success(
        `Batch transfer ${movement.referenceNumber} accepted! (${acceptedCount} product${
          acceptedCount > 1 ? "s" : ""
        } credited to ${activeLocation?.name || "inventory"})`
      );
      refetchAll();
    } catch (err: any) {
      console.error("[useStockMovements] Error accepting batch direct transfer:", err);
      toast.error(err.message || "Failed to accept stock transfer");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Action: Reject Direct Transfer (Batch)
  const handleRejectDirectTransfer = async (movement: UnifiedStockMovement) => {
    const transfersToProcess =
      movement.rawTransfers && movement.rawTransfers.length > 0
        ? movement.rawTransfers
        : movement.rawTransfer
        ? [movement.rawTransfer]
        : [];

    if (transfersToProcess.length === 0) return;

    if (
      !window.confirm(
        `Are you sure you want to reject incoming batch transfer ${movement.referenceNumber}?`
      )
    ) {
      return;
    }

    setActionInProgressId(movement.id);
    try {
      let rejectedCount = 0;
      for (const tr of transfersToProcess) {
        if ((tr.status || "").toLowerCase() === "pending") {
          await rejectTransferFromStore(tr.id);
          rejectedCount++;
        }
      }

      toast.success(
        `Batch transfer ${movement.referenceNumber} rejected (${rejectedCount} product${
          rejectedCount > 1 ? "s" : ""
        }).`
      );
      refetchAll();
    } catch (err: any) {
      console.error("[useStockMovements] Error rejecting batch transfer:", err);
      toast.error(err.message || "Failed to reject stock transfer");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Action: Cancel Requisition (Requester)
  const handleCancelRequisition = async (movement: UnifiedStockMovement) => {
    if (!pharmacyId || !movement.rawRequisition) return;
    if (!window.confirm(`Are you sure you want to cancel requisition ${movement.referenceNumber}?`)) {
      return;
    }
    setActionInProgressId(movement.id);
    try {
      await warehouseStorage.updateBranchRequisitionStatus(
        pharmacyId,
        movement.rawRequisition.id,
        "rejected"
      );
      setRequisitions((prev) =>
        prev.map((r) =>
          r.id === movement.rawRequisition?.id ? { ...r, status: "rejected" as any } : r
        )
      );
      toast.success(`Requisition ${movement.referenceNumber} has been cancelled.`);
      refetchAll();
    } catch (err: any) {
      console.error("[useStockMovements] Error cancelling requisition:", err);
      toast.error(err.message || "Failed to cancel requisition");
    } finally {
      setActionInProgressId(null);
    }
  };

  return {
    allMovements,
    inboundMovements,
    outboundMovements,
    summary,
    isLoading,
    isRefreshing,
    actionInProgressId,
    activeLocation,
    locations,
    pharmacyId,
    refetchAll,
    handleReceiveRequisitionDelivery,
    handleAcceptDirectTransfer,
    handleRejectDirectTransfer,
    handleCancelRequisition,
  };
}
