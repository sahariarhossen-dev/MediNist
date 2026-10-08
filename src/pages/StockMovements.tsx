import React, { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { useStockMovements } from "@/hooks/useStockMovements";
import { UnifiedStockMovement, MovementDirection } from "@/types/stockMovement";
import { CreateRequisitionDialog } from "@/components/stock-movements/CreateRequisitionDialog";
import { DirectTransferDialog } from "@/components/stock-movements/DirectTransferDialog";
import { FulfillRequisitionDialog } from "@/components/stock-movements/FulfillRequisitionDialog";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Truck,
  Warehouse,
  XCircle,
  Building2,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const StockMovementsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    allMovements,
    inboundMovements,
    outboundMovements,
    summary,
    isLoading,
    isRefreshing,
    actionInProgressId,
    activeLocation,
    refetchAll,
    handleReceiveRequisitionDelivery,
    handleAcceptDirectTransfer,
    handleRejectDirectTransfer,
    handleCancelRequisition,
  } = useStockMovements();

  // Active direction tab: 'inbound' | 'outbound' | 'all' (supports ?view= and ?tab=)
  const rawTab = (searchParams.get("view") || searchParams.get("tab") || "inbound").toLowerCase();
  const activeTab: "inbound" | "outbound" | "all" =
    rawTab === "outbound" ? "outbound" : rawTab === "all" ? "all" : "inbound";

  const setActiveTab = (tab: "inbound" | "outbound" | "all") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("view", tab);
      next.delete("tab");
      return next;
    });
  };

  const { profile } = useAuth();
  const { locations } = useLocationStore();

  // Dialog States
  const [isCreateRequisitionOpen, setIsCreateRequisitionOpen] = useState(false);
  const [isDirectTransferOpen, setIsDirectTransferOpen] = useState(false);
  const [fulfillingMovement, setFulfillingMovement] = useState<UnifiedStockMovement | null>(null);

  const handleRequisitionCreated = () => {
    setActiveTab("outbound");
    refetchAll();
  };

  const handleTransferCreated = () => {
    setActiveTab("outbound");
    refetchAll();
  };

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [selectedMovementForDetails, setSelectedMovementForDetails] =
    useState<UnifiedStockMovement | null>(null);

  // Tab-selected list
  const baseList = useMemo(() => {
    if (activeTab === "inbound") return inboundMovements;
    if (activeTab === "outbound") return outboundMovements;
    return allMovements;
  }, [activeTab, inboundMovements, outboundMovements, allMovements]);

  // Filtered List
  const filteredMovements = useMemo(() => {
    return baseList.filter((m) => {
      // 1. Text Search (reference, medicine name, locations)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = m.referenceNumber.toLowerCase().includes(q);
        const matchesFrom = m.fromLocationName.toLowerCase().includes(q);
        const matchesTo = m.toLocationName.toLowerCase().includes(q);
        const matchesNotes = m.notes ? m.notes.toLowerCase().includes(q) : false;
        const matchesItems = m.itemsPreview.some((it) => it.name.toLowerCase().includes(q));

        if (!matchesRef && !matchesFrom && !matchesTo && !matchesNotes && !matchesItems) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter === "needs_action") {
        if (!m.canReceive && !m.canFulfill) return false;
      } else if (statusFilter === "in_transit") {
        if (m.status !== "dispatched") return false;
      } else if (statusFilter === "completed") {
        if (m.status !== "completed") return false;
      } else if (statusFilter === "pending") {
        if (m.status !== "pending") return false;
      } else if (statusFilter === "rejected") {
        if (m.status !== "rejected" && m.status !== "cancelled") return false;
      }

      // 3. Source Type Filter
      if (sourceTypeFilter !== "all" && m.sourceType !== sourceTypeFilter) {
        return false;
      }

      return true;
    });
  }, [baseList, searchQuery, statusFilter, sourceTypeFilter]);

  // Helper Badge Renderers
  const renderStatusBadge = (m: UnifiedStockMovement) => {
    switch (m.status) {
      case "pending":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200/80 border font-medium text-[11px] px-2 py-0.5 rounded-full gap-1 hover:bg-amber-100/80 shadow-none">
            <Clock className="h-3 w-3" />
            {m.sourceType === "requisition" ? "Pending Approval" : "Pending Acceptance"}
          </Badge>
        );
      case "dispatched":
        return (
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200/80 border font-medium text-[11px] px-2 py-0.5 rounded-full gap-1 hover:bg-indigo-100/80 shadow-none">
            <Truck className="h-3 w-3" />
            In Transit
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200/80 border font-medium text-[11px] px-2 py-0.5 rounded-full gap-1 hover:bg-emerald-100/80 shadow-none">
            <CheckCircle2 className="h-3 w-3" />
            Reconciled
          </Badge>
        );
      case "rejected":
      case "cancelled":
        return (
          <Badge className="bg-rose-50 text-rose-700 border-rose-200/80 border font-medium text-[11px] px-2 py-0.5 rounded-full gap-1 hover:bg-rose-100/80 shadow-none">
            <XCircle className="h-3 w-3" />
            {m.status === "cancelled" ? "Cancelled" : "Rejected"}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full shadow-none">
            {m.rawStatus || m.status}
          </Badge>
        );
    }
  };

  const renderDirectionBadge = (m: UnifiedStockMovement) => {
    if (m.direction === "inbound") {
      return (
        <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-medium px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5">
          <ArrowDownLeft className="h-2.5 w-2.5" /> Inbound
        </span>
      );
    }
    return (
      <span className="bg-purple-50 text-purple-700 border border-purple-200/60 text-[10px] font-medium px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5">
        <ArrowUpRight className="h-2.5 w-2.5" /> Outbound
      </span>
    );
  };

  const renderTypeBadge = (m: UnifiedStockMovement) => {
    if (m.sourceType === "requisition") {
      return (
        <span className="bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-normal px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5">
          <Boxes className="h-2.5 w-2.5 text-slate-400" /> Requisition
        </span>
      );
    }
    return (
      <span className="bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-normal px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5">
        <Package className="h-2.5 w-2.5 text-slate-400" /> Transfer
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Top Header & KPI Container */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Header & Actions Consolidated Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Stock Movements
                </h1>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
                  <Building2 className="h-3 w-3 text-slate-500" />
                  {activeLocation?.name || "Active Location"}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Inter-branch inventory requisitions, direct transfers, and delivery reconciliation.
              </p>
            </div>

            {/* Clean Action Buttons Row */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDirectTransferOpen(true)}
                className="rounded-xl border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 h-9 px-3.5 gap-1.5 text-xs font-medium shadow-xs"
              >
                <Send className="h-3.5 w-3.5 text-slate-500" />
                Send Stock
              </Button>

              <Button
                size="sm"
                onClick={() => setIsCreateRequisitionOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs h-9 px-4 gap-1.5 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Request Stock
              </Button>
            </div>
          </div>

          {/* Minimalist KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6">
            {/* KPI 1: Inbound Awaiting Receipt */}
            <div
              onClick={() => {
                setActiveTab("inbound");
                setStatusFilter("needs_action");
              }}
              className="cursor-pointer bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 shadow-xs hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Awaiting Receipt
                </span>
                <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
                {summary.inboundActionRequired}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">In-transit intake needed</p>
            </div>

            {/* KPI 2: Outbound Pending Fulfillment */}
            <div
              onClick={() => {
                setActiveTab("outbound");
                setStatusFilter("needs_action");
              }}
              className="cursor-pointer bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 shadow-xs hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Demands to Fulfill
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Inbox className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
                {summary.outboundActionRequired}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Requested of this branch</p>
            </div>

            {/* KPI 3: Total Ledger */}
            <div
              onClick={() => {
                setActiveTab("all");
                setStatusFilter("all");
              }}
              className="cursor-pointer bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 shadow-xs hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Ledger
                </span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Boxes className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
                {summary.total}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">All logged transfers</p>
            </div>

            {/* KPI 4: Completed & Reconciled */}
            <div
              onClick={() => {
                setActiveTab("all");
                setStatusFilter("completed");
              }}
              className="cursor-pointer bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 shadow-xs hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Reconciled
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
                {summary.completedTotal}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Fully verified & shelved</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Navigation & Toolbar Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          {/* iOS / Shadcn Segmented Control Tabs */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/70 self-start">
            <button
              onClick={() => setActiveTab("inbound")}
              className={`flex items-center gap-1.5 py-1.5 px-3.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "inbound"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ArrowDownLeft
                className={`h-3.5 w-3.5 ${
                  activeTab === "inbound" ? "text-sky-600" : "text-slate-400"
                }`}
              />
              <span>Inbound</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === "inbound"
                    ? "bg-slate-100 text-slate-800"
                    : "bg-slate-200/70 text-slate-600"
                }`}
              >
                {summary.inboundTotal}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("outbound")}
              className={`flex items-center gap-1.5 py-1.5 px-3.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "outbound"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ArrowUpRight
                className={`h-3.5 w-3.5 ${
                  activeTab === "outbound" ? "text-purple-600" : "text-slate-400"
                }`}
              />
              <span>Outbound</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === "outbound"
                    ? "bg-slate-100 text-slate-800"
                    : "bg-slate-200/70 text-slate-600"
                }`}
              >
                {summary.outboundTotal}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-1.5 py-1.5 px-3.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "all"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Boxes
                className={`h-3.5 w-3.5 ${
                  activeTab === "all" ? "text-slate-700" : "text-slate-400"
                }`}
              />
              <span>All</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === "all"
                    ? "bg-slate-100 text-slate-800"
                    : "bg-slate-200/70 text-slate-600"
                }`}
              >
                {summary.total}
              </span>
            </button>
          </div>

          {/* Search & Filters Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[240px] sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference, medicine..."
                className="pl-8 h-9 rounded-xl bg-white border-slate-200 focus:bg-white text-xs shadow-2xs"
              />
            </div>

            {/* Filter Pills with Scrollbar Hidden */}
            <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-0.5">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/60 shrink-0">
                {[
                  { label: "All", value: "all" },
                  { label: "Action Needed", value: "needs_action" },
                  { label: "In Transit", value: "in_transit" },
                  { label: "Completed", value: "completed" },
                ].map((pill) => (
                  <button
                    key={pill.value}
                    onClick={() => setStatusFilter(pill.value)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${
                      statusFilter === pill.value
                        ? "bg-white text-slate-900 font-semibold shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Source Type Filter */}
              <select
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 text-slate-700 rounded-xl h-8.5 px-2.5 outline-hidden shadow-2xs font-medium cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="requisition">Requisitions</option>
                <option value="direct_transfer">Transfers</option>
              </select>
            </div>
          </div>
        </div>

        {/* Movements Feed */}
        {isLoading ? (
          <div className="py-20 text-center">
            <RefreshCw className="h-7 w-7 text-indigo-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">Loading stock movements...</p>
            <p className="text-xs text-slate-400 mt-1">Aggregating requisitions and direct transfers</p>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <Boxes className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">No stock movements found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "all"
                ? "No records match your active search and filter criteria."
                : activeTab === "inbound"
                ? "No stock is currently inbound to this location."
                : "No outbound dispatches or requests are registered."}
            </p>
            {(searchQuery || statusFilter !== "all" || sourceTypeFilter !== "all") && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setSourceTypeFilter("all");
                  }}
                  className="text-xs rounded-xl h-8"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredMovements.map((movement) => {
              const isActionProcessing = actionInProgressId === movement.id;

              return (
                <div
                  key={movement.id}
                  className="bg-white rounded-xl border border-slate-200/90 hover:border-slate-300 p-3 sm:p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                >
                  {/* Top Line: Direction Icon, Ref #, Sub-Badges & Primary Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          movement.direction === "inbound"
                            ? "bg-sky-50 text-sky-600"
                            : "bg-purple-50 text-purple-600"
                        }`}
                      >
                        {movement.direction === "inbound" ? (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                      </div>

                      <span className="font-bold text-slate-900 text-sm tracking-tight font-mono">
                        {movement.referenceNumber}
                      </span>

                      {renderDirectionBadge(movement)}
                      {renderTypeBadge(movement)}
                    </div>

                    {/* Primary Status Badge (Right Aligned) */}
                    <div className="shrink-0">
                      {renderStatusBadge(movement)}
                    </div>
                  </div>

                  {/* Middle Line: Routing & Date Meta */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Calendar className="h-3 w-3" />
                      {new Date(movement.createdAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>

                    <span className="text-slate-300">•</span>

                    <div className="flex items-center gap-1.5 font-medium text-slate-600">
                      <span className="truncate max-w-[150px] sm:max-w-[220px]">
                        {movement.fromLocationName}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[150px] sm:max-w-[220px]">
                        {movement.toLocationName}
                      </span>
                    </div>

                    {movement.notes && (
                      <>
                        <span className="text-slate-300 hidden md:inline">•</span>
                        <span className="text-slate-400 italic text-[11px] truncate max-w-xs">
                          Note: {movement.notes}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Item String Summary (Full Width) */}
                  <div className="text-xs sm:text-sm font-medium text-slate-700 flex items-center gap-1.5 truncate">
                    <Package className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-normal">
                      {movement.totalItemsCount} {movement.totalItemsCount === 1 ? "item" : "items"} ({movement.totalQuantity} total qty)
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-medium text-slate-800 truncate">
                      {movement.itemsPreview[0]?.name || "Medicine"}
                      {movement.itemsPreview.length > 1
                        ? `, ${movement.itemsPreview[1]?.name}${
                            movement.itemsPreview.length > 2
                              ? ` +${movement.itemsPreview.length - 2} more`
                              : ""
                          }`
                        : ""}
                    </span>
                  </div>

                  {/* Dedicated Action Footer */}
                  <div className="mt-3.5 pt-3 flex items-center justify-end gap-2 border-t border-slate-100 flex-wrap">
                    {/* Secondary Action: Inspect */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedMovementForDetails(movement)}
                      className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-medium h-9 px-3.5 text-xs sm:text-sm shadow-2xs"
                    >
                      Inspect
                    </Button>

                    {/* Secondary/Ghost Action: Reject Direct Transfer */}
                    {movement.canReject && movement.sourceType === "direct_transfer" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isActionProcessing}
                        onClick={() => handleRejectDirectTransfer(movement)}
                        className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-medium h-9 px-3 text-xs sm:text-sm"
                      >
                        Reject
                      </Button>
                    )}

                    {/* Secondary/Ghost Action: Cancel Requisition */}
                    {movement.canCancel && movement.sourceType === "requisition" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isActionProcessing}
                        onClick={() => handleCancelRequisition(movement)}
                        className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-medium h-9 px-3 text-xs sm:text-sm"
                      >
                        Cancel
                      </Button>
                    )}

                    {/* Primary Action 1: Receive Requisition Delivery */}
                    {movement.canReceive && movement.sourceType === "requisition" && (
                      <Button
                        size="sm"
                        disabled={isActionProcessing}
                        onClick={() => handleReceiveRequisitionDelivery(movement)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold h-9 px-4 gap-1.5 shadow-xs transition-all"
                      >
                        {isActionProcessing ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Receive Delivery
                      </Button>
                    )}

                    {/* Primary Action 2: Accept Direct Stock Transfer */}
                    {movement.canReceive && movement.sourceType === "direct_transfer" && (
                      <Button
                        size="sm"
                        disabled={isActionProcessing}
                        onClick={() => handleAcceptDirectTransfer(movement)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold h-9 px-4 gap-1.5 shadow-xs transition-all"
                      >
                        {isActionProcessing ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Accept Transfer
                      </Button>
                    )}

                    {/* Primary Action 3: Process & Fulfill Requisition */}
                    {movement.canFulfill && (
                      <Button
                        size="sm"
                        onClick={() => setFulfillingMovement(movement)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold h-9 px-4 gap-1.5 shadow-xs transition-all"
                      >
                        <Truck className="h-4 w-4" />
                        Process & Fulfill
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Movement Details Dialog */}
      <Dialog
        open={!!selectedMovementForDetails}
        onOpenChange={(open) => !open && setSelectedMovementForDetails(null)}
      >
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="font-mono text-base font-bold text-slate-900">
                Movement: {selectedMovementForDetails?.referenceNumber}
              </span>
              {selectedMovementForDetails && renderStatusBadge(selectedMovementForDetails)}
            </DialogTitle>
          </DialogHeader>

          {selectedMovementForDetails && (
            <div className="space-y-4 text-xs">
              {/* Route */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[11px]">Origin Location</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {selectedMovementForDetails.fromLocationName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Destination Location</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {selectedMovementForDetails.toLocationName}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="font-semibold text-slate-700 mb-2">Itemized Manifest:</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {selectedMovementForDetails.itemsPreview.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <span className="font-medium text-slate-800">{item.name}</span>
                      <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs">
                        {item.quantity} {item.unit || "pcs"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedMovementForDetails.notes && (
                <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl text-amber-800">
                  <span className="font-semibold block mb-0.5">Notes / Challan Reference:</span>
                  {selectedMovementForDetails.notes}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
            <div>
              {selectedMovementForDetails?.canFulfill && (
                <Button
                  size="sm"
                  onClick={() => {
                    const m = selectedMovementForDetails;
                    setSelectedMovementForDetails(null);
                    setFulfillingMovement(m);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold gap-1.5 shadow-xs"
                >
                  <Truck className="h-3.5 w-3.5" />
                  Process & Fulfill
                </Button>
              )}
              {selectedMovementForDetails?.canReceive && (
                <Button
                  size="sm"
                  onClick={() => {
                    const m = selectedMovementForDetails;
                    setSelectedMovementForDetails(null);
                    if (m.sourceType === "direct_transfer") {
                      handleAcceptDirectTransfer(m);
                    } else {
                      handleReceiveRequisitionDelivery(m);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold gap-1.5 shadow-xs"
                >
                  <Package className="h-3.5 w-3.5" />
                  Accept & Receive Delivery
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedMovementForDetails(null)}
              className="rounded-xl text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. Request Stock (Requisition) Dialog */}
      <CreateRequisitionDialog
        open={isCreateRequisitionOpen}
        onOpenChange={setIsCreateRequisitionOpen}
        activeLocation={activeLocation}
        locations={locations}
        pharmacyId={profile?.pharmacy_id}
        onSuccess={handleRequisitionCreated}
      />

      {/* 2. Send Stock (Direct Transfer) Dialog */}
      <DirectTransferDialog
        open={isDirectTransferOpen}
        onOpenChange={setIsDirectTransferOpen}
        activeLocation={activeLocation}
        locations={locations}
        pharmacyId={profile?.pharmacy_id}
        onSuccess={handleTransferCreated}
      />

      {/* 3. Fulfill Requisition Dialog */}
      <FulfillRequisitionDialog
        movement={fulfillingMovement}
        open={!!fulfillingMovement}
        onOpenChange={(open) => {
          if (!open) setFulfillingMovement(null);
        }}
        activeLocationId={activeLocation?.id}
        pharmacyId={profile?.pharmacy_id}
        onSuccess={refetchAll}
      />
    </div>
  );
};

export default StockMovementsPage;
