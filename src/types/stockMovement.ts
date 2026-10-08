import { BranchRequisition } from "./warehouseErp";
import { StockTransfer } from "./location";

export type MovementDirection = "inbound" | "outbound";
export type MovementType = "requisition" | "direct_transfer";

export type UnifiedMovementStatus =
  | "pending"
  | "dispatched"
  | "completed"
  | "rejected"
  | "cancelled";

export interface StockMovementItemPreview {
  id?: string;
  name: string;
  quantity: number;
  unit?: string;
  dispatchedQty?: number;
  receivedQty?: number;
}

export interface UnifiedStockMovement {
  id: string;
  sourceType: MovementType;
  referenceNumber: string;
  createdAt: string;
  updatedAt?: string;

  // Directional context relative to activeLocationId
  direction: MovementDirection;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;

  // Status & Priority
  status: UnifiedMovementStatus;
  rawStatus: string;
  priority?: "low" | "normal" | "urgent" | "emergency";

  // Item Breakdown
  totalItemsCount: number;
  totalQuantity: number;
  itemsPreview: StockMovementItemPreview[];
  notes?: string;

  // Authorizations
  canFulfill: boolean;
  canReceive: boolean;
  canCancel: boolean;
  canReject: boolean;

  // Original source records
  rawRequisition?: BranchRequisition;
  rawTransfer?: StockTransfer;
  rawTransfers?: StockTransfer[];
}

export interface StockMovementsSummary {
  total: number;
  inboundTotal: number;
  inboundActionRequired: number; // Inbound awaiting receipt or acceptance
  outboundTotal: number;
  outboundActionRequired: number; // Outbound demands awaiting fulfillment
  completedTotal: number;
}
