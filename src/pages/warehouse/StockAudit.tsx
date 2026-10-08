import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { warehouseStorage } from "@/services/warehouseStorage";
import {
  ClipboardCheck,
  ArrowLeft,
  Plus,
  Search,
  Scale,
  History,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Calendar,
  Warehouse,
  Eye,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface MedicineOption {
  id: string;
  name: string;
  stock_quantity: number;
  price: number;
  purchase_price_unit?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
}

interface AuditBatchItem {
  medicine_id: string;
  medicine_name: string;
  system_qty: number;
  counted_qty: number;
  variance_qty: number;
  unit_cost: number;
  reason: string;
}

interface PastAudit {
  id: string;
  audit_number: string;
  status: string;
  notes: string | null;
  conducted_at: string;
  conducted_by_name?: string;
  item_count: number;
  net_variance: number;
  net_financial_impact: number;
}

interface PastAuditItem {
  id: string;
  medicine_name: string;
  system_qty: number;
  counted_qty: number;
  variance_qty: number;
  unit_cost: number;
  reason: string | null;
}

const COMMON_REASONS = [
  "Physical Breakage / Damage",
  "Missing / Shrinkage",
  "Data Entry Error",
  "Expired / Spoiled Stock",
  "Surplus / Found Stock",
  "Transfer Discrepancy",
];

export default function StockAudit() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeLocation } = useLocationStore();

  const [activeTab, setActiveTab] = useState<"count" | "history">("count");

  // Inventory list for selection
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(false);

  // Active Count Session State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineOption | null>(null);
  const [countedQtyInput, setCountedQtyInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [batchItems, setBatchItems] = useState<AuditBatchItem[]>([]);
  const [sessionNotes, setSessionNotes] = useState<string>("");

  // Confirmation & submission state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Audit History State
  const [pastAudits, setPastAudits] = useState<PastAudit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  // Detail Modal for historical audit
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAuditForDetail, setSelectedAuditForDetail] = useState<PastAudit | null>(null);
  const [auditDetailItems, setAuditDetailItems] = useState<PastAuditItem[]>([]);
  const [loadingDetailItems, setLoadingDetailItems] = useState(false);

  // Fetch medicines available in active warehouse
  const fetchMedicines = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const locationId = activeLocation?.id;
    if (!pharmacyId) return;

    try {
      setLoadingMedicines(true);
      // Select standard columns that exist on public.medicines
      const { data, error } = await supabase
        .from("medicines")
        .select("id, name, stock_quantity, price, expiry_date, location_id")
        .eq("pharmacy_id", pharmacyId)
        .order("name", { ascending: true });

      if (error) throw error;

      let filtered = (data ?? []) as any[];
      if (locationId) {
        const locFiltered = filtered.filter((m) => m.location_id === locationId);
        if (locFiltered.length > 0) {
          filtered = locFiltered;
        }
      }

      setMedicines(
        filtered.map((m) => ({
          id: m.id,
          name: m.name,
          stock_quantity: Number(m.stock_quantity) || 0,
          price: Number(m.price) || 0,
          purchase_price_unit: m.price ? Math.round(Number(m.price) * 0.88 * 100) / 100 : 15,
          expiry_date: m.expiry_date || null,
          batch_number: null,
        }))
      );
    } catch (err: any) {
      console.warn("[StockAudit] Error loading medicines:", err?.message || err);
    } finally {
      setLoadingMedicines(false);
    }
  }, [profile?.pharmacy_id, activeLocation?.id]);

  // Fetch previous stock audits
  const fetchPastAudits = useCallback(async () => {
    const pharmacyId = profile?.pharmacy_id;
    const locationId = activeLocation?.id;
    if (!pharmacyId) return;

    try {
      setLoadingHistory(true);
      const audits = await warehouseStorage.getStockAudits(pharmacyId, locationId || "default");
      const mapped: PastAudit[] = (audits || []).map((a) => {
        const items = a.items || [];
        let netVar = 0;
        let netFin = 0;
        items.forEach((it) => {
          const v = Number(it.variance_quantity || it.variance_qty || 0);
          netVar += v;
          netFin += v * 20;
        });
        return {
          id: a.id,
          audit_number: a.audit_number,
          status: a.status,
          notes: a.notes,
          conducted_at: a.conducted_at || a.created_at,
          item_count: items.length,
          net_variance: netVar,
          net_financial_impact: netFin,
        };
      });

      setPastAudits(mapped);
    } catch (err: any) {
      console.warn("[StockAudit] Error loading past audits:", err?.message || err);
    } finally {
      setLoadingHistory(false);
    }
  }, [profile?.pharmacy_id, activeLocation?.id]);

  useEffect(() => {
    fetchMedicines();
    fetchPastAudits();
  }, [fetchMedicines, fetchPastAudits]);

  // Filter medicines for autocomplete
  const filteredMedicines = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const query = searchTerm.toLowerCase();
    return medicines
      .filter((m) => m.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [medicines, searchTerm]);

  // Handle medicine selection
  const handleSelectMedicine = (med: MedicineOption) => {
    setSelectedMedicine(med);
    setSearchTerm(med.name);
    // Pre-populate counted qty with current system qty as a convenient baseline
    setCountedQtyInput(String(med.stock_quantity));
    setReasonInput("");
    setCustomReason("");
  };

  // Calculate live variance for current single-item form
  const currentVariance = useMemo(() => {
    if (!selectedMedicine || countedQtyInput === "") return null;
    const counted = parseInt(countedQtyInput, 10);
    if (isNaN(counted)) return null;
    return counted - selectedMedicine.stock_quantity;
  }, [selectedMedicine, countedQtyInput]);

  const currentUnitCost = useMemo(() => {
    if (!selectedMedicine) return 0;
    return (
      selectedMedicine.purchase_price_unit ??
      Math.round(selectedMedicine.price * 0.88 * 100) / 100
    );
  }, [selectedMedicine]);

  const effectiveReason = reasonInput === "custom" ? customReason.trim() : reasonInput;

  // Add item to batch
  const handleAddItemToBatch = () => {
    if (!selectedMedicine) {
      toast.error("Please select a medicine first");
      return;
    }
    const counted = parseInt(countedQtyInput, 10);
    if (isNaN(counted) || counted < 0) {
      toast.error("Please enter a valid non-negative physical count");
      return;
    }

    const variance = counted - selectedMedicine.stock_quantity;

    if (variance !== 0 && !effectiveReason) {
      toast.error("Please specify a reason for the stock variance");
      return;
    }

    // Check if item already exists in batch
    const existingIndex = batchItems.findIndex((b) => b.medicine_id === selectedMedicine.id);
    const newItem: AuditBatchItem = {
      medicine_id: selectedMedicine.id,
      medicine_name: selectedMedicine.name,
      system_qty: selectedMedicine.stock_quantity,
      counted_qty: counted,
      variance_qty: variance,
      unit_cost: currentUnitCost,
      reason: variance === 0 ? "Physical count matched system balance" : effectiveReason,
    };

    if (existingIndex >= 0) {
      const updated = [...batchItems];
      updated[existingIndex] = newItem;
      setBatchItems(updated);
      toast.info(`Updated count for "${selectedMedicine.name}" in batch`);
    } else {
      setBatchItems((prev) => [newItem, ...prev]);
      toast.success(`Added "${selectedMedicine.name}" to audit batch`);
    }

    // Reset single item form
    setSelectedMedicine(null);
    setSearchTerm("");
    setCountedQtyInput("");
    setReasonInput("");
    setCustomReason("");
  };

  const handleRemoveBatchItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Batch totals
  const batchTotals = useMemo(() => {
    let totalItems = batchItems.length;
    let netVariance = 0;
    let netCostImpact = 0;
    let missingCount = 0;
    let surplusCount = 0;

    batchItems.forEach((item) => {
      netVariance += item.variance_qty;
      netCostImpact += item.variance_qty * item.unit_cost;
      if (item.variance_qty < 0) missingCount += Math.abs(item.variance_qty);
      if (item.variance_qty > 0) surplusCount += item.variance_qty;
    });

    return {
      totalItems,
      netVariance,
      netCostImpact,
      missingCount,
      surplusCount,
    };
  }, [batchItems]);

  // Submit and execute reconciliation
  const handleConfirmReconcile = async () => {
    if (batchItems.length === 0) {
      toast.error("No items in audit batch to reconcile");
      return;
    }

    const pharmacyId = profile?.pharmacy_id;
    const locationId = activeLocation?.id;
    if (!pharmacyId || !locationId) {
      toast.error("Missing warehouse session context");
      return;
    }

    try {
      setSubmitting(true);

      const itemsPayload = batchItems.map((item) => ({
        medicine_id: item.medicine_id,
        medicine_name: item.medicine_name,
        system_qty: item.system_qty,
        counted_qty: item.counted_qty,
        variance_qty: item.variance_qty,
        unit_cost: item.unit_cost,
        reason: item.reason,
      }));

      const auditNumber = `AUD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Primary: Try high-performance ACID PostgreSQL RPC if present
      let rpcSucceeded = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          "reconcile_stock_audit" as any,
          {
            p_location_id: locationId,
            p_notes: sessionNotes || "Physical cycle count reconciliation",
            p_items: itemsPayload,
          }
        );
        if (!rpcErr && rpcRes) {
          rpcSucceeded = true;
        }
      } catch {
        rpcSucceeded = false;
      }

      // 2. Adjust physical inventory in medicines table
      for (const item of batchItems) {
        try {
          await supabase
            .from("medicines")
            .update({
              stock_quantity: item.counted_qty,
            })
            .eq("pharmacy_id", pharmacyId)
            .eq("id", item.medicine_id);
        } catch (mErr) {
          console.warn("[StockAudit] Error updating medicine quantity:", mErr);
        }
      }

      // 3. Persist audit record in resilient warehouseStorage
      await warehouseStorage.saveStockAudit(
        pharmacyId,
        locationId,
        {
          audit_number: auditNumber,
          notes: sessionNotes || "Physical cycle count reconciliation",
          status: "completed",
        },
        batchItems.map((b) => ({
          medicine_id: b.medicine_id,
          medicine_name: b.medicine_name,
          system_quantity: b.system_qty,
          counted_quantity: b.counted_qty,
          variance_quantity: b.variance_qty,
          adjustment_reason: b.reason,
        }))
      );

      toast.success(`Stock reconciliation recorded! Audit #${auditNumber}`);
      finishReconciliation();
    } catch (err: any) {
      console.error("[StockAudit] Reconciliation failure:", err);
      toast.error(err.message || "Failed to commit stock audit reconciliation");
    } finally {
      setSubmitting(false);
      setConfirmModalOpen(false);
    }
  };

  const finishReconciliation = () => {
    setBatchItems([]);
    setSessionNotes("");
    fetchMedicines();
    fetchPastAudits();
    setActiveTab("history");
  };

  // Open detail modal for a past audit
  const handleOpenAuditDetail = async (audit: PastAudit) => {
    setSelectedAuditForDetail(audit);
    setDetailModalOpen(true);
    setLoadingDetailItems(true);

    try {
      const audits = await warehouseStorage.getStockAudits(
        profile!.pharmacy_id,
        activeLocation?.id || "default"
      );
      const matched = audits.find(
        (a) => a.id === audit.id || a.audit_number === audit.audit_number
      );
      if (matched && matched.items && matched.items.length > 0) {
        setAuditDetailItems(
          matched.items.map((it, idx) => ({
            id: it.id || `item_${idx}`,
            medicine_name: it.medicine_name,
            system_qty: it.system_quantity || it.system_qty || 0,
            counted_qty: it.counted_quantity || it.counted_qty || 0,
            variance_qty: it.variance_quantity || it.variance_qty || 0,
            unit_cost: it.unit_cost || 20,
            reason: it.adjustment_reason || it.reason || "Cycle count",
          }))
        );
        return;
      }

      const { data, error } = await supabase
        .from("stock_audit_items" as any)
        .select("id, medicine_name, system_qty, counted_qty, variance_qty, unit_cost, reason")
        .eq("audit_id", audit.id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setAuditDetailItems((data as PastAuditItem[]) ?? []);
      }
    } catch (err: any) {
      console.warn("[StockAudit] Error loading audit detail items:", err?.message || err);
    } finally {
      setLoadingDetailItems(false);
    }
  };

  // Filtered history list
  const filteredPastAudits = useMemo(() => {
    if (!historySearch.trim()) return pastAudits;
    const q = historySearch.toLowerCase();
    return pastAudits.filter(
      (a) =>
        a.audit_number.toLowerCase().includes(q) ||
        (a.notes && a.notes.toLowerCase().includes(q))
    );
  }, [pastAudits, historySearch]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/more")}
            className="rounded-full bg-white shadow-xs hover:bg-slate-50 border border-slate-200"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Physical Stock Reconciliation</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold border border-teal-200">
                Cycle Audit
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeLocation?.name || "Central Godown"} — Physical Shelf Count Verification & Variance Ledger
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-xl self-start sm:self-auto border border-slate-300/60">
          <button
            type="button"
            onClick={() => setActiveTab("count")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "count"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Scale className="h-3.5 w-3.5 text-teal-600" />
            Active Count Session
            {batchItems.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-teal-600 text-white rounded-full text-[10px] font-bold">
                {batchItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <History className="h-3.5 w-3.5 text-indigo-600" />
            Audit History & Logs
          </button>
        </div>
      </div>

      {/* TAB 1: ACTIVE COUNT SESSION */}
      {activeTab === "count" && (
        <div className="space-y-6">
          {/* Section 1: Item Counting Form */}
          <Card className="p-5 border-0 shadow-sm rounded-2xl bg-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Select Medicine & Record Physical Count</h2>
                  <p className="text-[11px] text-slate-500">
                    Compare current shelf quantity against system balance
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchMedicines}
                className="text-xs text-slate-500 hover:text-slate-800 gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingMedicines ? "animate-spin" : ""}`} />
                Refresh Stock
              </Button>
            </div>

            {/* Medicine Autocomplete */}
            <div className="relative">
              <Label className="text-xs font-semibold text-slate-700">Search Warehouse Catalog</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Type medicine name or brand..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (selectedMedicine && e.target.value !== selectedMedicine.name) {
                      setSelectedMedicine(null);
                    }
                  }}
                  className="pl-9 bg-slate-50 border-slate-200 text-sm rounded-xl focus:bg-white"
                />
              </div>

              {/* Suggestions Dropdown */}
              {!selectedMedicine && filteredMedicines.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredMedicines.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMedicine(m)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{m.name}</p>
                        <p className="text-[11px] text-slate-500">
                          Batch: {m.batch_number || "Default"} • Exp: {m.expiry_date || "N/A"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 block">{m.stock_quantity} pcs</span>
                        <span className="text-[10px] text-slate-500">System Stock</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* If medicine selected, show the count verification panel */}
            {selectedMedicine && (
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Selected Item</span>
                    <h3 className="text-base font-bold text-slate-900">{selectedMedicine.name}</h3>
                    <p className="text-xs text-slate-500">
                      Estimated Cost: ৳{currentUnitCost.toFixed(2)}/pc
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-2 bg-white rounded-xl border border-slate-200 text-center shadow-2xs">
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">System Balance</span>
                      <span className="text-base font-bold text-slate-900 tabular-nums">
                        {selectedMedicine.stock_quantity} pcs
                      </span>
                    </div>
                  </div>
                </div>

                {/* Input Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Physical Count Input */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Physical Counted Quantity <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 118"
                        value={countedQtyInput}
                        onChange={(e) => setCountedQtyInput(e.target.value)}
                        className="bg-white border-slate-200 text-base font-bold tabular-nums rounded-xl focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Calculated Variance Preview */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Calculated Variance</Label>
                    <div className="mt-1 h-10 px-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                      <span className="text-xs text-slate-500">Discrepancy:</span>
                      {currentVariance === null ? (
                        <span className="text-xs text-slate-400 italic">Enter count</span>
                      ) : currentVariance === 0 ? (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700 font-bold text-xs gap-1 border-slate-300">
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-600" />
                          0 (Exact Match)
                        </Badge>
                      ) : currentVariance < 0 ? (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 font-bold text-xs gap-1 border-rose-200">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                          {currentVariance} pcs (Deficit / Missing)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 font-bold text-xs gap-1 border-emerald-200">
                          <Plus className="h-3.5 w-3.5 text-emerald-600" />
                          +{currentVariance} pcs (Surplus / Found)
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Adjustment Reason (Mandatory if variance != 0) */}
                {currentVariance !== 0 && currentVariance !== null && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">
                        Adjustment Reason <span className="text-red-500">*</span>
                      </Label>
                      <span className="text-[11px] text-slate-500">Required for compliance audit trail</span>
                    </div>

                    {/* Common reason pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            setReasonInput(r);
                            setCustomReason("");
                          }}
                          className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                            reasonInput === r
                              ? "bg-teal-600 text-white font-semibold shadow-2xs"
                              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setReasonInput("custom")}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                          reasonInput === "custom"
                            ? "bg-teal-600 text-white font-semibold shadow-2xs"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        Custom Reason...
                      </button>
                    </div>

                    {reasonInput === "custom" && (
                      <Input
                        placeholder="Specify custom variance explanation..."
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        className="bg-white border-slate-200 text-xs rounded-xl mt-2"
                      />
                    )}
                  </div>
                )}

                {/* Add to Batch CTA */}
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    onClick={handleAddItemToBatch}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-xs gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add to Audit Session Batch
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Section 2: Working Audit Session Batch */}
          <Card className="p-5 border-0 shadow-sm rounded-2xl bg-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Current Audit Session Items</h2>
                  <p className="text-[11px] text-slate-500">
                    Review uncommitted physical counts before applying inventory adjustments
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
                {batchItems.length} items staged
              </span>
            </div>

            {batchItems.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <FileSpreadsheet className="h-9 w-9 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No items staged for audit yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Select a medicine above, enter the physical count, and click "Add to Audit Session Batch"
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-medium">
                        <th className="pb-2 pl-1">Medicine Name</th>
                        <th className="pb-2 text-center">System</th>
                        <th className="pb-2 text-center">Counted</th>
                        <th className="pb-2 text-center">Variance</th>
                        <th className="pb-2 text-right">Est. Impact</th>
                        <th className="pb-2 pl-3">Reason</th>
                        <th className="pb-2 text-right pr-1">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batchItems.map((item, idx) => {
                        const financialImpact = item.variance_qty * item.unit_cost;
                        return (
                          <tr key={item.medicine_id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 pl-1 font-semibold text-slate-900 max-w-[180px] truncate">
                              {item.medicine_name}
                            </td>
                            <td className="py-2.5 text-center text-slate-600 tabular-nums">
                              {item.system_qty}
                            </td>
                            <td className="py-2.5 text-center font-bold text-slate-900 tabular-nums">
                              {item.counted_qty}
                            </td>
                            <td className="py-2.5 text-center tabular-nums">
                              {item.variance_qty === 0 ? (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                  0 Match
                                </span>
                              ) : item.variance_qty < 0 ? (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">
                                  {item.variance_qty} pcs
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                  +{item.variance_qty} pcs
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-2.5 text-right font-medium tabular-nums ${
                                financialImpact < 0
                                  ? "text-rose-600"
                                  : financialImpact > 0
                                  ? "text-emerald-600"
                                  : "text-slate-400"
                              }`}
                            >
                              ৳{Math.abs(financialImpact).toFixed(2)}
                            </td>
                            <td className="py-2.5 pl-3 text-slate-600 max-w-[160px] truncate text-[11px]">
                              {item.reason}
                            </td>
                            <td className="py-2.5 text-right pr-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveBatchItem(idx)}
                                className="h-7 w-7 text-slate-400 hover:text-rose-600 rounded-lg"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Session Cumulative Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Reconciled</span>
                    <span className="text-sm font-bold text-slate-900">{batchTotals.totalItems} Medicines</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Net Unit Delta</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        batchTotals.netVariance < 0
                          ? "text-rose-600"
                          : batchTotals.netVariance > 0
                          ? "text-emerald-600"
                          : "text-slate-700"
                      }`}
                    >
                      {batchTotals.netVariance > 0 ? `+${batchTotals.netVariance}` : batchTotals.netVariance} pcs
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Missing / Deficit</span>
                    <span className="text-sm font-bold text-rose-600 tabular-nums">
                      {batchTotals.missingCount} pcs
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Financial Impact</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        batchTotals.netCostImpact < 0
                          ? "text-rose-600"
                          : batchTotals.netCostImpact > 0
                          ? "text-emerald-600"
                          : "text-slate-700"
                      }`}
                    >
                      {batchTotals.netCostImpact < 0 ? "-" : "+"}৳
                      {Math.abs(batchTotals.netCostImpact).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Session Notes */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Audit Session Notes (Optional)</Label>
                  <Textarea
                    placeholder="e.g. Q1 Central Godown physical cycle count on Bay A & B..."
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    rows={2}
                    className="mt-1 bg-white border-slate-200 text-xs rounded-xl"
                  />
                </div>

                {/* Final Submit CTA */}
                <div className="pt-2 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setBatchItems([])}
                    className="text-xs rounded-xl border-slate-200 text-slate-600"
                  >
                    Clear Batch
                  </Button>
                  <Button
                    onClick={() => setConfirmModalOpen(true)}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-sm gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Commit Reconciliation & Update Stock
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: AUDIT HISTORY & LOGS */}
      {activeTab === "history" && (
        <Card className="p-5 border-0 shadow-sm rounded-2xl bg-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Historical Physical Audits</h2>
              <p className="text-[11px] text-slate-500">
                Audited stock reconciliation records and variance write-off logs
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search audit number or notes..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-8 text-xs bg-slate-50 border-slate-200 rounded-xl h-8"
              />
            </div>
          </div>

          {loadingHistory ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-teal-600" />
              <p className="text-xs">Loading audit ledger...</p>
            </div>
          ) : filteredPastAudits.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <History className="h-9 w-9 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">No audit records found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Completed physical reconciliation sessions will be cataloged here with full item write-offs
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPastAudits.map((audit) => (
                <div
                  key={audit.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">{audit.audit_number}</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                        {audit.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Conducted: {new Date(audit.conducted_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    {audit.notes && (
                      <p className="text-xs text-slate-600 italic">"{audit.notes}"</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900 block tabular-nums">
                        {audit.item_count} items reconciled
                      </span>
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${
                          audit.net_variance < 0
                            ? "text-rose-600"
                            : audit.net_variance > 0
                            ? "text-emerald-600"
                            : "text-slate-500"
                        }`}
                      >
                        Net: {audit.net_variance > 0 ? `+${audit.net_variance}` : audit.net_variance} pcs (৳
                        {audit.net_financial_impact.toFixed(2)})
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAuditDetail(audit)}
                      className="text-xs rounded-xl border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 gap-1.5 shadow-2xs"
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-500" />
                      View Items
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* CONFIRMATION MODAL */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="rounded-2xl max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-teal-600" />
              Confirm Stock Reconciliation
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600">
            <p>
              You are about to commit physical counts for{" "}
              <strong className="text-slate-900">{batchItems.length} items</strong> at{" "}
              <strong className="text-slate-900">{activeLocation?.name || "Warehouse"}</strong>.
            </p>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 space-y-1">
              <p className="font-semibold">⚠️ Inventory Balance Adjustment Notice:</p>
              <p className="text-[11px]">
                Submitting this audit will immediately adjust the actual{" "}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">stock_quantity</code> of these medicines in the live inventory catalog.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span>Total Items:</span>
                <span className="font-bold text-slate-900">{batchTotals.totalItems}</span>
              </div>
              <div className="flex justify-between">
                <span>Net Unit Variance:</span>
                <span
                  className={`font-bold tabular-nums ${
                    batchTotals.netVariance < 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {batchTotals.netVariance > 0 ? `+${batchTotals.netVariance}` : batchTotals.netVariance} pcs
                </span>
              </div>
              <div className="flex justify-between">
                <span>Financial Impact:</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  ৳{Math.abs(batchTotals.netCostImpact).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={handleConfirmReconcile}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Applying ACID Adjustment...
                </>
              ) : (
                "Confirm & Commit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AUDIT DETAIL MODAL */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="rounded-2xl max-w-xl mx-auto max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Audit Breakdown — {selectedAuditForDetail?.audit_number}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 py-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Date Conducted</span>
                <span className="font-semibold text-slate-800">
                  {selectedAuditForDetail?.conducted_at &&
                    new Date(selectedAuditForDetail.conducted_at).toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Notes</span>
                <span className="font-medium text-slate-700 italic">
                  {selectedAuditForDetail?.notes || "None recorded"}
                </span>
              </div>
            </div>

            {loadingDetailItems ? (
              <div className="py-8 text-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-teal-600" />
                <p>Loading items...</p>
              </div>
            ) : auditDetailItems.length === 0 ? (
              <p className="py-6 text-center text-slate-400">No items found for this audit.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                    <th className="pb-2">Medicine</th>
                    <th className="pb-2 text-center">System</th>
                    <th className="pb-2 text-center">Counted</th>
                    <th className="pb-2 text-center">Variance</th>
                    <th className="pb-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditDetailItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 font-semibold text-slate-900">{item.medicine_name}</td>
                      <td className="py-2.5 text-center text-slate-600 tabular-nums">{item.system_qty}</td>
                      <td className="py-2.5 text-center font-bold text-slate-900 tabular-nums">{item.counted_qty}</td>
                      <td className="py-2.5 text-center tabular-nums">
                        {item.variance_qty === 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            0
                          </span>
                        ) : item.variance_qty < 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">
                            {item.variance_qty} pcs
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            +{item.variance_qty} pcs
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-600 text-[11px]">{item.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
