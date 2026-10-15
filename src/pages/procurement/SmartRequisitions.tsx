import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { DAYS_OF_WEEK } from "@/types/warehouseErp";
import {
  Sparkles,
  Calendar,
  Building2,
  Package,
  Phone,
  MessageCircle,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  ArrowRight,
  ClipboardList,
  RefreshCw,
  Search,
  Filter,
  Save,
  Check,
  Truck,
  Layers,
  FileText,
  Clock,
  ExternalLink,
  Eye,
  Share2,
  Copy,
  Send,
  CheckCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export interface InFlightOrderReference {
  requisition_id: string;
  requisition_number: string;
  status: "draft" | "shared" | "confirmed" | "sr_confirmed" | string;
  ordered_qty_pcs: number;
  pack_mode?: string;
  boxes_to_order?: number;
  created_at: string;
}

export type LifecycleStatus = "UNSTAGED_SHORTAGE" | "STAGED_IN_DRAFT" | "ORDERED_IN_FLIGHT";

export interface PlannerItemState {
  medicine_id: string;
  medicine_name: string;
  generic_name: string | null;
  company_name: string | null;
  current_stock_pcs: number;
  reorder_level_pcs: number;
  suggested_qty_pcs: number;
  strip_per_pack: number;
  pcs_per_strip: number;
  pieces_per_box: number;
  estimated_tp: number;
  // Lifecycle status & in-flight order reference
  lifecycle_status: LifecycleStatus;
  active_in_flight_ref?: InFlightOrderReference | null;
  // User editable states
  pack_mode: "box" | "strip" | "piece";
  order_boxes: number;
  order_strips: number;
  order_pcs: number;
  is_selected: boolean;
}

export interface PlannerSupplierGroup {
  supplier_id: string;
  supplier_name: string;
  sr_name: string | null;
  sr_phone: string | null;
  sr_whatsapp: string | null;
  order_days: number[];
  is_scheduled_today: boolean;
  short_items_count: number;
  delta_short_count: number;
  staged_count: number;
  ordered_count: number;
  total_estimated_value: number;
  delta_estimated_value: number;
  items: PlannerItemState[];
  notes: string;
  is_saving: boolean;
  linked_manufacturer_ids: string[];
  linked_manufacturer_names: string[];
  latest_draft_id?: string | null;
  latest_draft_number?: string | null;
}

// Module-level calculation helpers
const calculateTotalPieces = (item: PlannerItemState): number => {
  if (item.pack_mode === "box") {
    return item.order_boxes * item.pieces_per_box;
  } else if (item.pack_mode === "strip") {
    return item.order_strips * item.pcs_per_strip;
  } else {
    return item.order_pcs;
  }
};

const calculateLineTotal = (item: PlannerItemState): number => {
  const pcs = calculateTotalPieces(item);
  return pcs * item.estimated_tp;
};

// Normalize pharmaceutical company names for robust multi-tier matching
const normalizeCompanyName = (name?: string | null): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(plc|ltd|limited|corporation|corp|inc|pharma|pharmaceuticals|laboratories|lab|co|group)\b/gi, "")
    .replace(/[^\w\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Resilient helper to safely normalize raw order_days inputs
 * (integers, stringified numbers, JSON arrays, or comma-delimited strings) into valid day indices [0-6].
 */
export const normalizeOrderDays = (raw: any): number[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((d) => Number(d)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeOrderDays(parsed);
    } catch {}
    return raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
  }
  return [];
};

/**
 * Format a high-trust, professional WhatsApp markdown dispatch payload.
 * Prevents naked URLs and ensures full clarity and safety for Medical Representatives (SRs).
 * Strictly formats branch identity and address to prevent parent organization ("City Shop") leaks.
 */
export const generateWhatsAppShareMessage = (params: {
  branchName?: string;
  branchAddress?: string | null;
  supplierName?: string | null;
  reqNumber: string;
  itemCount: number;
  totalAmount?: number | null;
  srName?: string | null;
  orderUrl: string;
  storeName?: string;
}): string => {
  const {
    branchName,
    branchAddress,
    supplierName,
    reqNumber,
    itemCount,
    totalAmount,
    srName,
    orderUrl,
    storeName,
  } = params;

  const effectiveBranch = branchName || storeName || "Our Pharmacy";
  const repGreeting = srName && srName.trim() ? `Assalamu Alaikum ${srName.trim()},\n\n` : "";
  const formattedCost =
    totalAmount != null && Number(totalAmount) > 0
      ? `৳ ${Number(totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      : null;

  return [
    `${repGreeting}*MEDINIST DIGITAL PROCUREMENT REQUISITION*`,
    `🏥 *Branch:* ${effectiveBranch}`,
    ...(branchAddress && branchAddress.trim() ? [`📍 *Location:* ${branchAddress.trim()}`] : []),
    ...(supplierName && supplierName.trim() ? [`🏢 *Company:* ${supplierName.trim()}`] : []),
    `📋 *Order No:* #${reqNumber}`,
    `💊 *Items:* ${itemCount} ${itemCount === 1 ? "medicine" : "medicines"}`,
    ...(formattedCost ? [`💰 *Estimated Total:* ${formattedCost}`] : []),
    ``,
    `🔗 *View Verified Order Sheet:*`,
    `${orderUrl}`,
    ``,
    `_Please review the medicine quantities and submit your delivery confirmation directly through the secure order link above. Thank you!_`,
  ].join("\n");
};

export default function SmartRequisitions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { activeLocation } = useLocationStore();
  const { pharmacyId, branchId, branchName, branchAddress, branchPhone } = useActiveWorkspace();

  // Active Day filter: 0 = Sun, 1 = Mon, ..., 6 = Sat, -1 = All Days
  const [activeDay, setActiveDay] = useState<number>(() => new Date().getDay());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [suppliersData, setSuppliersData] = useState<PlannerSupplierGroup[]>([]);
  const [expandedSupplierIds, setExpandedSupplierIds] = useState<Record<string, boolean>>({});

  // Active view: "planner" (Auto Short-List) or "history" (Saved Requisitions)
  const [viewMode, setViewMode] = useState<"planner" | "history">("planner");
  const [savedRequisitions, setSavedRequisitions] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [sharingReqId, setSharingReqId] = useState<string | null>(null);
  const [reviewReq, setReviewReq] = useState<any | null>(null);

  // Success summary modal after saving a draft
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [lastSavedSummary, setLastSavedSummary] = useState<{
    reqId: string;
    reqNumber: string;
    supplierId: string;
    supplierName: string;
    srName?: string | null;
    srWhatsApp?: string | null;
    itemCount: number;
    totalAmount: number;
  } | null>(null);

  // Master-Detail state for Order Editor Modal
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);
  const [savedSupplierIds, setSavedSupplierIds] = useState<Record<string, boolean>>({});

  // Search & add medicines inside Detail Modal
  const [medSearchQuery, setMedSearchQuery] = useState("");
  const [medSearchResults, setMedSearchResults] = useState<any[]>([]);
  const [isSearchingMeds, setIsSearchingMeds] = useState(false);

  // Today's real day name
  const todayDayIndex = new Date().getDay();
  const todayDayName = DAYS_OF_WEEK.find((d) => d.day === todayDayIndex)?.label || "Today";

  // Label for compact header dropdown trigger
  const activeDayTriggerLabel = useMemo(() => {
    if (activeDay === -1) {
      return "All Vendors";
    }
    const matched = DAYS_OF_WEEK.find((d) => d.day === activeDay);
    if (!matched) return "Select Routine";
    if (activeDay === todayDayIndex) {
      return `Today (${matched.short})`;
    }
    return `${matched.label} (${matched.short})`;
  }, [activeDay, todayDayIndex]);

  // Fetch Planner Suggestions using Deterministic Relational Query & In-Flight State Engine
  const fetchSuggestions = useCallback(async () => {
    if (!pharmacyId) return;
    try {
      setLoading(true);

      // 1. Fetch suppliers strictly belonging to active branch
      let supQuery = (supabase.from("suppliers" as any) as any)
        .select("*")
        .eq("pharmacy_id", pharmacyId)
        .eq("is_active", true)
        .is("deleted_at", null);

      if (branchId) {
        supQuery = supQuery.eq("location_id", branchId);
      }

      // 2. Fetch shelf medicines strictly belonging to active branch
      let medsQuery = supabase
        .from("medicines")
        .select(
          "id, name, company_name, generic_name, manufacturer_id, preferred_supplier_id, stock_quantity, stock_alert, reorder_level, price, pcs_per_strip, strip_per_pack, location_id"
        )
        .eq("pharmacy_id", pharmacyId);

      if (branchId) {
        medsQuery = medsQuery.eq("location_id", branchId);
      }

      // 3. Fetch active/in-flight requisitions strictly belonging to active branch
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      let reqsQuery = (supabase.from("requisitions" as any) as any)
        .select(`
          id,
          requisition_number,
          status,
          supplier_id,
          location_id,
          created_at,
          requisition_items (
            id,
            medicine_id,
            final_order_qty_pcs,
            pack_mode,
            boxes_to_order,
            strips_to_order,
            estimated_trade_price
          )
        `)
        .eq("pharmacy_id", pharmacyId)
        .in("status", ["draft", "shared", "sr_confirmed"])
        .gte("created_at", sevenDaysAgo);

      if (branchId) {
        reqsQuery = reqsQuery.eq("location_id", branchId);
      }

      // 4. Fetch junction mappings and active manufacturers
      const smQuery = (supabase.from("supplier_manufacturers" as any) as any)
        .select("supplier_id, manufacturer_id")
        .eq("pharmacy_id", pharmacyId);

      const mfgQuery = (supabase.from("manufacturers" as any) as any)
        .select("id, name, code, is_active")
        .eq("is_active", true);

      const [suppRes, medsRes, smRes, mfgRes, reqsRes] = await Promise.all([
        supQuery,
        medsQuery,
        smQuery,
        mfgQuery,
        reqsQuery,
      ]);

      if (medsRes.error) {
        console.error("[SmartRequisitions] Error fetching medicines:", medsRes.error);
      }
      if (suppRes.error) {
        console.error("[SmartRequisitions] Error fetching suppliers:", suppRes.error);
      }
      if (smRes.error) {
        console.error("[SmartRequisitions] Error fetching supplier_manufacturers:", smRes.error);
      }
      if (reqsRes.error) {
        console.error("[SmartRequisitions] Error fetching requisitions:", reqsRes.error);
      }

      const suppliers = suppRes.data || [];
      const medicines = medsRes.data || [];

      // Safe multi-tenant in-flight items retrieval strictly scoped to branch
      const activeProcurementData: any[] = [];
      const rawReqs = reqsRes.data || [];
      rawReqs.forEach((r: any) => {
        // Guard against foreign rows:
        if (branchId && r.location_id && r.location_id !== branchId) return;

        (r.requisition_items || []).forEach((ri: any) => {
          if (ri.medicine_id) {
            activeProcurementData.push({
              medicine_id: ri.medicine_id,
              supplier_id: r.supplier_id,
              pharmacy_id: pharmacyId,
              requisition_id: r.id,
              requisition_number: r.requisition_number,
              requisition_status: r.status,
              requisition_created_at: r.created_at,
              in_flight_pcs: ri.final_order_qty_pcs || (ri as any).requested_quantity || 0,
              pack_mode: ri.pack_mode,
              boxes_to_order: ri.boxes_to_order || 0,
            });
          }
        });
      });

      // Build In-Flight lookup map by medicine_id
      const inFlightByMedicineId = new Map<string, InFlightOrderReference>();
      const latestDraftBySupplierId = new Map<string, { id: string; reqNumber: string }>();

      activeProcurementData.forEach((row: any) => {
        if (!row.medicine_id) return;

        // Track latest open draft per supplier
        if (row.requisition_status === "draft" && row.supplier_id) {
          if (!latestDraftBySupplierId.has(row.supplier_id)) {
            latestDraftBySupplierId.set(row.supplier_id, {
              id: row.requisition_id,
              reqNumber: row.requisition_number,
            });
          }
        }

        const existing = inFlightByMedicineId.get(row.medicine_id);
        // Prioritize active 'draft' over 'shared' or 'confirmed'
        if (!existing || (existing.status !== "draft" && row.requisition_status === "draft")) {
          inFlightByMedicineId.set(row.medicine_id, {
            requisition_id: row.requisition_id,
            requisition_number: row.requisition_number,
            status: row.requisition_status,
            ordered_qty_pcs: Number(row.in_flight_pcs) || 0,
            pack_mode: row.pack_mode,
            boxes_to_order: row.boxes_to_order,
            created_at: row.requisition_created_at,
          });
        }
      });

      // Build fallback manufacturer name dictionary in case of joined relationship schema cache delay
      const mfgNameLookup: Record<string, string> = {};
      (mfgRes.data || []).forEach((m: any) => {
        if (m.id && m.name) {
          mfgNameLookup[m.id] = m.name;
        }
      });

      // Build supplier -> linked manufacturer IDs and Names
      const supplierMfgMap: Record<string, { ids: string[]; names: string[] }> = {};
      (smRes.data || []).forEach((row: any) => {
        if (!supplierMfgMap[row.supplier_id]) {
          supplierMfgMap[row.supplier_id] = { ids: [], names: [] };
        }
        if (row.manufacturer_id && !supplierMfgMap[row.supplier_id].ids.includes(row.manufacturer_id)) {
          supplierMfgMap[row.supplier_id].ids.push(row.manufacturer_id);
        }
        const mName = mfgNameLookup[row.manufacturer_id];
        if (mName && !supplierMfgMap[row.supplier_id].names.includes(mName)) {
          supplierMfgMap[row.supplier_id].names.push(mName);
        }
      });

      // 2. Strict Shortage Calculation: evaluate only shelf medicines belonging to active branch
      const shortageMeds = (medicines || []).filter((med: any) => {
        // Guard against foreign rows:
        if (branchId && med.location_id && med.location_id !== branchId) return false;

        const stock = Number(med.stock_quantity ?? 0);
        const rawAlert = med.stock_alert !== null && med.stock_alert !== undefined ? Number(med.stock_alert) : null;

        // Rule A: Hard Out-of-Stock (Critical) - any product with stock <= 0
        if (stock <= 0) return true;

        // Rule B: Low Stock against specified alert (if alert > 0)
        if (rawAlert !== null && rawAlert > 0 && stock <= rawAlert) return true;

        // Rule C: Safe Fallback Threshold when alert is 0 or null (e.g. stock <= 5)
        if ((rawAlert === null || rawAlert === 0) && stock <= 5) return true;

        return false;
      });

      const groups: PlannerSupplierGroup[] = suppliers.map((sup: any) => {
        const orderDays = normalizeOrderDays(sup.order_days ?? sup.scheduled_order_days);
        const isToday = activeDay === -1 ? orderDays.includes(todayDayIndex) : orderDays.includes(activeDay);

        const linkedMfgIds = supplierMfgMap[sup.id]?.ids || [];
        const linkedMfgNames = supplierMfgMap[sup.id]?.names || [];

        // Deterministic Multi-Tier Relational & Normalized Match:
        const matchedMeds = shortageMeds.filter((medicine: any) => {
          // Tier 1: Direct relational match via supplier_manufacturers junction (Enterprise Approach C)
          if (Boolean(medicine.manufacturer_id) && linkedMfgIds.includes(medicine.manufacturer_id)) {
            return true;
          }

          // Tier 2: Direct preferred supplier relationship
          if (medicine.preferred_supplier_id && medicine.preferred_supplier_id === sup.id) {
            return true;
          }

          // Tier 3: Intelligent Normalized Company Name matching against linked manufacturers
          // (Handles legacy medicines where manufacturer_id is NULL or discrepancies like 'Square' vs 'Square Pharmaceuticals PLC')
          if (medicine.company_name && linkedMfgNames.length > 0) {
            const medNorm = normalizeCompanyName(medicine.company_name);
            if (medNorm) {
              for (const mfgName of linkedMfgNames) {
                const mfgNorm = normalizeCompanyName(mfgName);
                if (
                  medNorm === mfgNorm ||
                  (medNorm.length >= 3 && mfgNorm.includes(medNorm)) ||
                  (mfgNorm.length >= 3 && medNorm.includes(mfgNorm))
                ) {
                  return true;
                }
              }
            }
          }

          // Tier 4: Direct Supplier Name match fallback (e.g. if supplier was named "Square Pharmaceuticals")
          if (medicine.company_name && sup.name) {
            const medNorm = normalizeCompanyName(medicine.company_name);
            const supNorm = normalizeCompanyName(sup.name);
            if (
              medNorm &&
              supNorm &&
              (medNorm === supNorm ||
                (medNorm.length >= 3 && supNorm.includes(medNorm)) ||
                (supNorm.length >= 3 && medNorm.includes(supNorm)))
            ) {
              return true;
            }
          }

          return false;
        });

        // Compute items, suggested order quantities, unit purchase costs & in-flight state machine
        const items: PlannerItemState[] = matchedMeds.map((m: any) => {
          const spp = Number(m.strip_per_pack) || 1;
          const pps = Number(m.pcs_per_strip) || 1;
          const ppb = spp * pps;
          const curStock = Number(m.stock_quantity) || 0;
          const reorderAlert = Number(m.stock_alert) || 10;
          const targetStock = 50; // Standard replenishment target
          const suggested = Math.max(targetStock - curStock, ppb);

          const initialBoxes = ppb > 1 ? Math.max(1, Math.ceil(suggested / ppb)) : 0;
          const initialStrips = ppb <= 1 && pps > 1 ? Math.max(1, Math.ceil(suggested / pps)) : 0;
          const initialPcs = ppb <= 1 && pps <= 1 ? suggested : 0;
          const mode: "box" | "strip" | "piece" = ppb > 1 ? "box" : pps > 1 ? "strip" : "piece";

          // Calculate unit purchase cost (from purchase_price if available, or estimated 88% trade price)
          const unitCost = Number(m.purchase_price) || (Number(m.price) ? Number(m.price) * 0.88 : 10.0);

          // State Machine: Resolve in-flight status
          const inFlightRef = inFlightByMedicineId.get(m.id) || null;
          let lifecycle_status: LifecycleStatus = "UNSTAGED_SHORTAGE";

          if (inFlightRef) {
            if (inFlightRef.status === "draft") {
              lifecycle_status = "STAGED_IN_DRAFT";
            } else if (["shared", "confirmed", "sr_confirmed"].includes(inFlightRef.status)) {
              lifecycle_status = "ORDERED_IN_FLIGHT";
            }
          }

          // Unstaged shortages are selected by default; staged/in-flight items default to unselected to prevent duplicate ordering
          const isSelectedByDefault = lifecycle_status === "UNSTAGED_SHORTAGE";

          return {
            medicine_id: m.id,
            medicine_name: m.name,
            generic_name: m.generic_name || null,
            company_name: m.company_name || null,
            current_stock_pcs: curStock,
            reorder_level_pcs: reorderAlert,
            suggested_qty_pcs: suggested,
            strip_per_pack: spp,
            pcs_per_strip: pps,
            pieces_per_box: ppb,
            estimated_tp: unitCost,
            lifecycle_status,
            active_in_flight_ref: inFlightRef,
            pack_mode: mode,
            order_boxes: initialBoxes,
            order_strips: initialStrips,
            order_pcs: initialPcs,
            is_selected: isSelectedByDefault,
          };
        });

        // Compute Delta Shortage vs Staged / Pipeline totals
        const deltaShortCount = items.filter((it) => it.lifecycle_status === "UNSTAGED_SHORTAGE").length;
        const stagedCount = items.filter((it) => it.lifecycle_status === "STAGED_IN_DRAFT").length;
        const orderedCount = items.filter((it) => it.lifecycle_status === "ORDERED_IN_FLIGHT").length;

        const deltaEstValue = items
          .filter((it) => it.lifecycle_status === "UNSTAGED_SHORTAGE")
          .reduce((sum, it) => sum + it.suggested_qty_pcs * it.estimated_tp, 0);

        const totalEstValue = items.reduce(
          (sum, it) => sum + it.suggested_qty_pcs * it.estimated_tp,
          0
        );

        const latestDraft = latestDraftBySupplierId.get(sup.id);

        return {
          supplier_id: sup.id,
          supplier_name: sup.name,
          sr_name: sup.sr_name || null,
          sr_phone: sup.sr_phone || null,
          sr_whatsapp: sup.sr_whatsapp || null,
          order_days: orderDays,
          is_scheduled_today: isToday,
          short_items_count: items.length,
          delta_short_count: deltaShortCount,
          staged_count: stagedCount,
          ordered_count: orderedCount,
          total_estimated_value: totalEstValue,
          delta_estimated_value: deltaEstValue,
          items,
          notes: "",
          is_saving: false,
          linked_manufacturer_ids: linkedMfgIds,
          linked_manufacturer_names: linkedMfgNames,
          latest_draft_id: latestDraft?.id || null,
          latest_draft_number: latestDraft?.reqNumber || null,
        };
      });

      setSuppliersData(groups);

      // Auto-expand suppliers with unhandled delta shortages or any shortages
      const expands: Record<string, boolean> = {};
      groups.forEach((g) => {
        if (g.delta_short_count > 0 || g.short_items_count > 0) {
          expands[g.supplier_id] = true;
        }
      });
      setExpandedSupplierIds((prev) => ({ ...prev, ...expands }));
    } catch (err: any) {
      console.error("[SmartRequisitions] Fetch error:", err);
      toast.error("Could not load shortage suggestions");
    } finally {
      setLoading(false);
    }
  }, [pharmacyId, branchId, activeDay, todayDayIndex]);

  // Fetch Saved Requisitions (strictly scoped to active branch workspace)
  const fetchSavedRequisitions = useCallback(async () => {
    if (!pharmacyId) return;
    try {
      setLoadingSaved(true);
      let query = supabase
        .from("requisitions" as any)
        .select(`
          id,
          location_id,
          requisition_number,
          supplier_id,
          status,
          total_estimated_amount,
          created_at,
          notes,
          suppliers (id, name, sr_name, sr_phone, sr_whatsapp),
          requisition_items (id, medicine_name, final_order_qty_pcs, pack_mode, boxes_to_order, strips_to_order),
          requisition_magic_links (id, token, expires_at, is_revoked, sr_acknowledged_at, sr_notes)
        `)
        .eq("pharmacy_id", pharmacyId);

      if (branchId) {
        query = query.eq("location_id", branchId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        setSavedRequisitions(data);
      }
    } catch (err) {
      console.warn("Error fetching saved requisitions:", err);
    } finally {
      setLoadingSaved(false);
    }
  }, [pharmacyId, branchId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // Listen to global workspace change events (dispatched by ActiveBranchCard / LocationContext)
  useEffect(() => {
    const handleWorkspaceChanged = () => {
      // Reset state for new branch to prevent stale leaking
      setSavedSupplierIds({});
      setActiveSupplierId(null);
      setMedSearchResults([]);
      fetchSuggestions();
      if (viewMode === "history") {
        fetchSavedRequisitions();
      }
    };

    window.addEventListener("medinist:workspace-changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("medinist:workspace-changed", handleWorkspaceChanged);
    };
  }, [fetchSuggestions, fetchSavedRequisitions, viewMode]);

  // Handle vendor_id deep link from Suppliers page (?vendor_id=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const targetVendorId = params.get("vendor_id");
    if (!targetVendorId || !pharmacyId) return;

    // Check if supplier exists in current suppliersData
    const matchedSupplier = suppliersData.find((s) => s.supplier_id === targetVendorId);
    if (matchedSupplier) {
      setActiveSupplierId(targetVendorId);
      // Clean query params so it does not keep re-triggering
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (!loading) {
      // If supplier isn't in today's routine suggestions, fetch vendor info and inject an empty group so operator can draft immediately
      const loadSpecificSupplier = async () => {
        try {
          let specQuery = supabase
            .from("suppliers" as any)
            .select("*")
            .eq("id", targetVendorId)
            .eq("pharmacy_id", pharmacyId);

          if (branchId) {
            specQuery = specQuery.eq("location_id", branchId);
          }

          const { data: sup } = await specQuery.maybeSingle();

          if (sup) {
            setSuppliersData((prev) => {
              if (prev.some((s) => s.supplier_id === sup.id)) return prev;
              return [
                {
                  supplier_id: sup.id,
                  supplier_name: sup.name,
                  sr_name: sup.sr_name || null,
                  sr_phone: sup.sr_phone || null,
                  sr_whatsapp: sup.sr_whatsapp || null,
                  order_days: Array.isArray(sup.order_days) ? sup.order_days : [],
                  is_scheduled_today: true,
                  short_items_count: 0,
                  delta_short_count: 0,
                  staged_count: 0,
                  ordered_count: 0,
                  total_estimated_value: 0,
                  delta_estimated_value: 0,
                  items: [],
                  notes: "",
                  is_saving: false,
                  linked_manufacturer_ids: [],
                  linked_manufacturer_names: [],
                  latest_draft_id: null,
                  latest_draft_number: null,
                },
                ...prev,
              ];
            });
            setActiveSupplierId(sup.id);
            window.history.replaceState({}, document.title, window.location.pathname);
            toast.info(`Opened requisition editor for ${sup.name}`);
          }
        } catch (fetchSupErr) {
          console.warn("Could not load vendor for deep link:", fetchSupErr);
        }
      };

      loadSpecificSupplier();
    }
  }, [location.search, suppliersData, loading, pharmacyId, branchId]);

  useEffect(() => {
    if (viewMode === "history") {
      fetchSavedRequisitions();
    }
  }, [viewMode, fetchSavedRequisitions]);

  // Stepper handlers
  const handleQuantityChange = (
    supplierId: string,
    medicineId: string,
    delta: number
  ) => {
    setSuppliersData((prev) =>
      prev.map((sup) => {
        if (sup.supplier_id !== supplierId) return sup;
        const updatedItems = sup.items.map((it) => {
          if (it.medicine_id !== medicineId) return it;
          if (it.pack_mode === "box") {
            const next = Math.max(1, it.order_boxes + delta);
            return { ...it, order_boxes: next };
          } else if (it.pack_mode === "strip") {
            const next = Math.max(1, it.order_strips + delta);
            return { ...it, order_strips: next };
          } else {
            const next = Math.max(1, it.order_pcs + delta);
            return { ...it, order_pcs: next };
          }
        });
        return { ...sup, items: updatedItems };
      })
    );
  };

  const handlePackModeToggle = (
    supplierId: string,
    medicineId: string,
    newMode: "box" | "strip" | "piece"
  ) => {
    setSuppliersData((prev) =>
      prev.map((sup) => {
        if (sup.supplier_id !== supplierId) return sup;
        const updatedItems = sup.items.map((it) => {
          if (it.medicine_id !== medicineId) return it;
          const currentTotalPieces = calculateTotalPieces(it);
          let newBoxes = 0;
          let newStrips = 0;
          let newPcs = 0;

          if (newMode === "box") {
            newBoxes = Math.max(1, Math.ceil(currentTotalPieces / it.pieces_per_box));
          } else if (newMode === "strip") {
            newStrips = Math.max(1, Math.ceil(currentTotalPieces / it.pcs_per_strip));
          } else {
            newPcs = Math.max(1, currentTotalPieces);
          }

          return {
            ...it,
            pack_mode: newMode,
            order_boxes: newBoxes,
            order_strips: newStrips,
            order_pcs: newPcs,
          };
        });
        return { ...sup, items: updatedItems };
      })
    );
  };

  const handleToggleItemSelection = (supplierId: string, medicineId: string) => {
    setSuppliersData((prev) =>
      prev.map((sup) => {
        if (sup.supplier_id !== supplierId) return sup;
        return {
          ...sup,
          items: sup.items.map((it) =>
            it.medicine_id === medicineId ? { ...it, is_selected: !it.is_selected } : it
          ),
        };
      })
    );
  };

  const handleSupplierNotesChange = (supplierId: string, notes: string) => {
    setSuppliersData((prev) =>
      prev.map((sup) => (sup.supplier_id === supplierId ? { ...sup, notes } : sup))
    );
  };

  // Currently active supplier for the Order Editor Modal
  const activeSupplier = useMemo(
    () => suppliersData.find((s) => s.supplier_id === activeSupplierId) || null,
    [suppliersData, activeSupplierId]
  );

  // Debounced search for extra medicines to add to active supplier's order draft
  useEffect(() => {
    if (!medSearchQuery.trim() || medSearchQuery.length < 2 || !pharmacyId) {
      setMedSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingMeds(true);
      try {
        let mQuery = supabase
          .from("medicines")
          .select("id, name, generic_name, company_name, stock_quantity, stock_alert, price, strip_per_pack, pcs_per_strip, location_id")
          .eq("pharmacy_id", pharmacyId)
          .or(`name.ilike.%${medSearchQuery.trim()}%,generic_name.ilike.%${medSearchQuery.trim()}%`);

        if (branchId) {
          mQuery = mQuery.eq("location_id", branchId);
        }

        const { data } = await mQuery.limit(8);
        setMedSearchResults(data || []);
      } catch (e) {
        console.warn("Med search error:", e);
      } finally {
        setIsSearchingMeds(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [medSearchQuery, pharmacyId, branchId]);

  const handleAddMedicineToSupplier = (supplierId: string, med: any) => {
    setSuppliersData((prev) =>
      prev.map((sup) => {
        if (sup.supplier_id !== supplierId) return sup;
        if (sup.items.some((it) => it.medicine_id === med.id)) {
          toast.info("Medicine is already in this order draft");
          return sup;
        }
        const spp = Number(med.strip_per_pack) || 1;
        const pps = Number(med.pcs_per_strip) || 1;
        const ppb = spp * pps;
        const mode: "box" | "strip" | "piece" = ppb > 1 ? "box" : pps > 1 ? "strip" : "piece";
        const newItem: PlannerItemState = {
          medicine_id: med.id,
          medicine_name: med.name,
          generic_name: med.generic_name || null,
          company_name: med.company_name || null,
          current_stock_pcs: Number(med.stock_quantity) || 0,
          reorder_level_pcs: Number(med.stock_alert) || 10,
          suggested_qty_pcs: ppb > 1 ? ppb : pps > 1 ? pps : 10,
          strip_per_pack: spp,
          pcs_per_strip: pps,
          pieces_per_box: ppb,
          estimated_tp: Number(med.price ? med.price * 0.88 : 10.0),
          lifecycle_status: "UNSTAGED_SHORTAGE",
          active_in_flight_ref: null,
          pack_mode: mode,
          order_boxes: mode === "box" ? 1 : 0,
          order_strips: mode === "strip" ? 1 : 0,
          order_pcs: mode === "piece" ? 10 : 0,
          is_selected: true,
        };
        return {
          ...sup,
          items: [newItem, ...sup.items],
        };
      })
    );
    toast.success(`Added ${med.name} to order draft`);
  };

  const handleRemoveItem = (supplierId: string, medicineId: string) => {
    setSuppliersData((prev) =>
      prev.map((sup) =>
        sup.supplier_id === supplierId
          ? { ...sup, items: sup.items.filter((it) => it.medicine_id !== medicineId) }
          : sup
      )
    );
  };

  // Save Order Draft Master & Items (Supports append to existing draft or creating fresh/supplementary order)
  const handleSaveOrderDraft = async (
    supplier: PlannerSupplierGroup,
    mode: "auto" | "append" | "supplementary" = "auto"
  ) => {
    if (!pharmacyId) return;

    if (!branchId) {
      toast.error("Active branch is not resolved. Please select a valid branch before creating an order draft.");
      return;
    }

    const selectedItems = supplier.items.filter((it) => it.is_selected);
    if (selectedItems.length === 0) {
      toast.error("Please select at least one medicine item to order");
      return;
    }

    try {
      // Mark saving state
      setSuppliersData((prev) =>
        prev.map((s) => (s.supplier_id === supplier.supplier_id ? { ...s, is_saving: true } : s))
      );

      const isAppending =
        (mode === "append" || (mode === "auto" && Boolean(supplier.latest_draft_id) && supplier.delta_short_count > 0 && supplier.staged_count > 0)) &&
        Boolean(supplier.latest_draft_id);

      const deltaAmount = selectedItems.reduce((sum, it) => sum + calculateLineTotal(it), 0);

      let targetReqId = supplier.latest_draft_id || "";
      let targetReqNumber = supplier.latest_draft_number || "";
      let cumulativeTotalAmount = deltaAmount;

      if (isAppending && supplier.latest_draft_id) {
        // --- 1A. APPEND TO EXISTING ACTIVE DRAFT ---
        // Fetch current draft master total
        const { data: existingDraft } = await (supabase.from("requisitions" as any) as any)
          .select("id, requisition_number, total_estimated_amount")
          .eq("id", supplier.latest_draft_id)
          .single();

        const currentDraftTotal = Number(existingDraft?.total_estimated_amount || 0);
        cumulativeTotalAmount = currentDraftTotal + deltaAmount;
        targetReqNumber = existingDraft?.requisition_number || supplier.latest_draft_number || "REQ-DRAFT";

        // Insert new line items mapped to the existing draft
        const itemsPayload = selectedItems.map((it) => {
          const finalPcs = calculateTotalPieces(it);
          const lineTotal = finalPcs * it.estimated_tp;
          return {
            requisition_id: supplier.latest_draft_id,
            medicine_id: it.medicine_id || null,
            medicine_name: it.medicine_name,
            generic_name: it.generic_name,
            company_name: it.company_name,
            current_stock_pcs: it.current_stock_pcs,
            reorder_level_pcs: it.reorder_level_pcs,
            suggested_qty_pcs: it.suggested_qty_pcs,
            final_order_qty_pcs: finalPcs,
            pack_mode: it.pack_mode,
            boxes_to_order: it.pack_mode === "box" ? it.order_boxes : 0,
            strips_to_order: it.pack_mode === "strip" ? it.order_strips : 0,
            pieces_per_box: it.pieces_per_box,
            pcs_per_strip: it.pcs_per_strip,
            strip_per_pack: it.strip_per_pack,
            estimated_trade_price: it.estimated_tp,
            estimated_line_total: lineTotal,
          };
        });

        const { error: itemsError } = await (supabase.from("requisition_items" as any) as any).insert(
          itemsPayload
        );

        if (itemsError) {
          throw new Error(itemsError.message || "Failed to append items to existing draft");
        }

        // Update requisitions master record total & timestamp
        await (supabase.from("requisitions" as any) as any)
          .update({
            total_estimated_amount: cumulativeTotalAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", supplier.latest_draft_id);

        toast.success(`Appended ${selectedItems.length} delta items to Draft #${targetReqNumber}!`);
      } else {
        // --- 1B. CREATE FRESH OR SUPPLEMENTARY REQUISITION ---
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const requisitionNumber = `REQ-${dateStr}-${randomSuffix}`;
        targetReqNumber = requisitionNumber;

        // Insert master record into public.requisitions strictly stamping active branch
        const requisitionPayload = {
          pharmacy_id: pharmacyId,
          location_id: branchId, // Strictly stamp active branch ID
          supplier_id: supplier.supplier_id,
          requisition_number: requisitionNumber,
          status: "draft",
          scheduled_order_day: activeDay === -1 ? todayDayIndex : activeDay,
          total_estimated_amount: deltaAmount,
          notes: supplier.notes.trim() || null,
          created_by: profile?.id || null,
        };

        const { data: reqRecord, error: reqError } = await (supabase.from("requisitions" as any) as any)
          .insert(requisitionPayload)
          .select()
          .single();

        if (reqError) {
          throw new Error(reqError.message || "Failed to create requisition record");
        }

        targetReqId = reqRecord.id;

        // Bulk insert line items into public.requisition_items
        const itemsPayload = selectedItems.map((it) => {
          const finalPcs = calculateTotalPieces(it);
          const lineTotal = finalPcs * it.estimated_tp;
          return {
            requisition_id: reqRecord.id,
            medicine_id: it.medicine_id || null,
            medicine_name: it.medicine_name,
            generic_name: it.generic_name,
            company_name: it.company_name,
            current_stock_pcs: it.current_stock_pcs,
            reorder_level_pcs: it.reorder_level_pcs,
            suggested_qty_pcs: it.suggested_qty_pcs,
            final_order_qty_pcs: finalPcs,
            pack_mode: it.pack_mode,
            boxes_to_order: it.pack_mode === "box" ? it.order_boxes : 0,
            strips_to_order: it.pack_mode === "strip" ? it.order_strips : 0,
            pieces_per_box: it.pieces_per_box,
            pcs_per_strip: it.pcs_per_strip,
            strip_per_pack: it.strip_per_pack,
            estimated_trade_price: it.estimated_tp,
            estimated_line_total: lineTotal,
          };
        });

        const { error: itemsError } = await (supabase.from("requisition_items" as any) as any).insert(
          itemsPayload
        );

        if (itemsError) {
          throw new Error(itemsError.message || "Failed to insert requisition line items");
        }

        toast.success(`Order Draft #${requisitionNumber} saved successfully!`);
      }

      // Visually mark supplier card as "Draft Saved" and close editor modal smoothly
      setSavedSupplierIds((prev) => ({ ...prev, [supplier.supplier_id]: true }));
      setActiveSupplierId(null);

      // Open summary modal with representative contact context
      setLastSavedSummary({
        reqId: targetReqId,
        reqNumber: targetReqNumber,
        supplierId: supplier.supplier_id,
        supplierName: supplier.supplier_name,
        srName: supplier.sr_name,
        srWhatsApp: supplier.sr_whatsapp,
        itemCount: selectedItems.length,
        totalAmount: cumulativeTotalAmount,
      });
      setSavedModalOpen(true);

      // Recalculate in-flight state machine and delta shortages immediately in background (zero page reload)
      await fetchSuggestions();
    } catch (err: any) {
      console.error("[SmartRequisitions] Save draft error:", err);
      toast.error(err.message || "Could not save order draft");
    } finally {
      setSuppliersData((prev) =>
        prev.map((s) => (s.supplier_id === supplier.supplier_id ? { ...s, is_saving: false } : s))
      );
    }
  };

  // Magic Link Generator & WhatsApp Dispatcher
  const handleGenerateAndShareLink = async (
    target: {
      reqId?: string;
      id?: string;
      reqNumber?: string;
      requisition_number?: string;
      supplierId?: string;
      supplier_id?: string;
      status?: string;
      supplierName?: string;
      srName?: string | null;
      srWhatsApp?: string | null;
      totalAmount?: number | null;
      total_estimated_amount?: number | null;
      itemCount?: number;
      requisition_items?: any[];
      suppliers?: { id?: string; name?: string; sr_name?: string | null; sr_whatsapp?: string | null };
      requisition_magic_links?: Array<{ token: string; expires_at: string; is_revoked: boolean }>;
    },
    autoOpenWhatsApp = true
  ) => {
    if (!pharmacyId) return;

    const requisitionId = target.reqId || target.id;
    const reqNumber = target.reqNumber || target.requisition_number;
    const sId = target.supplierId || target.supplier_id || target.suppliers?.id;
    const sWhatsApp = target.srWhatsApp || target.suppliers?.sr_whatsapp || "";
    const sName = target.srName || target.suppliers?.sr_name || "Representative";
    const currentStatus = target.status || "draft";
    const estTotal = target.totalAmount ?? target.total_estimated_amount ?? null;
    const itemCount =
      target.itemCount ??
      (Array.isArray(target.requisition_items) ? target.requisition_items.length : 0);

    if (!requisitionId || !sId) {
      toast.error("Requisition or Supplier information is missing");
      return;
    }

    try {
      setSharingReqId(requisitionId);

      // 1. Check for existing active token
      let token = "";
      const existing = (target.requisition_magic_links || []).find(
        (l) => !l.is_revoked && new Date(l.expires_at) > new Date()
      );

      if (existing?.token) {
        token = existing.token;
      } else {
        // Query DB or insert new 72-hour magic link
        const { data: dbLinks } = await (supabase.from("requisition_magic_links" as any) as any)
          .select("token, expires_at, is_revoked")
          .eq("requisition_id", requisitionId)
          .eq("is_revoked", false)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1);

        if (dbLinks && dbLinks.length > 0) {
          token = dbLinks[0].token;
        } else {
          const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
          const { data: newLink, error: linkErr } = await (supabase.from("requisition_magic_links" as any) as any)
            .insert({
              requisition_id: requisitionId,
              pharmacy_id: pharmacyId,
              supplier_id: sId,
              expires_at: expiresAt,
            })
            .select("token")
            .single();

          if (linkErr) throw new Error(linkErr.message);
          token = newLink.token;
        }
      }

      // 2. Mark status as 'shared' if it was 'draft'
      if (currentStatus === "draft") {
        await (supabase.from("requisitions" as any) as any)
          .update({ status: "shared", updated_at: new Date().toISOString() })
          .eq("id", requisitionId);
        setSavedRequisitions((prev) =>
          prev.map((r) => (r.id === requisitionId ? { ...r, status: "shared" } : r))
        );
        // Refresh planner state machine in background so cards transition
        fetchSuggestions().catch((err) => console.error("Error refreshing after share:", err));
      }

      // 3. Construct Public Magic Portal URL with explicit branch parameter context
      const urlQuery = new URLSearchParams();
      if (branchName) urlQuery.set("branch", branchName);
      if (branchAddress) urlQuery.set("addr", branchAddress);
      if (branchPhone) urlQuery.set("phone", branchPhone);
      const queryStr = urlQuery.toString();
      const portalUrl = `${window.location.origin}/order/${token}${queryStr ? `?${queryStr}` : ""}`;

      // 4. Construct Professional Branded WhatsApp Dispatch Message (strictly scoped to active branch)
      const sCompanyName = target.supplierName || target.suppliers?.name || "";
      const cleanPhone = sWhatsApp.replace(/[^0-9]/g, "");

      const msg = generateWhatsAppShareMessage({
        branchName: branchName || "Our Pharmacy",
        branchAddress: branchAddress || "",
        supplierName: sCompanyName,
        reqNumber: reqNumber || "REQ-ORDER",
        itemCount: itemCount > 0 ? itemCount : 1,
        totalAmount: estTotal,
        srName: sName,
        orderUrl: portalUrl,
      });

      if (autoOpenWhatsApp) {
        if (cleanPhone) {
          window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
          toast.success("WhatsApp opened with formatted order summary!");
        } else {
          await navigator.clipboard.writeText(msg);
          toast.info("No WhatsApp number on file for SR. Full order message & link copied to clipboard!");
        }
      } else {
        await navigator.clipboard.writeText(msg);
        toast.success("Order summary & link copied to clipboard!");
      }
    } catch (err: any) {
      console.error("[SmartRequisitions] Share error:", err);
      toast.error(err.message || "Failed to create magic link");
    } finally {
      setSharingReqId(null);
    }
  };

  // Convert Requisition into Purchase Order (Receive Goods Pipeline)
  const handleConvertToPO = (req: any) => {
    navigate(`/procurement/purchase-orders?from_requisition=${req.id}`, {
      state: {
        fromRequisition: true,
        requisition_id: req.id,
        requisition_number: req.requisition_number,
        supplier_id: req.supplier_id || req.suppliers?.id,
        notes: `Converted from Requisition: ${req.requisition_number}`,
        items: (req.requisition_items || []).map((it: any) => ({
          medicine_id: it.medicine_id || undefined,
          medicine_name: it.medicine_name,
          ordered_qty: Number(it.final_order_qty_pcs) || 1,
          trade_price: Number(it.estimated_trade_price) || 0,
          pack_mode: it.pack_mode || "piece",
          boxes_to_order: it.boxes_to_order || 0,
          strips_to_order: it.strips_to_order || 0,
        })),
      },
    });
  };

  // Shortage Planner filter mode: "all" | "delta" | "staged"
  const [shortageFilterMode, setShortageFilterMode] = useState<"all" | "delta" | "staged">("all");

  // Filtered view by routine day, search query & shortage state filter
  const filteredSuppliers = useMemo(() => {
    let result = suppliersData;

    // Gate 1: Routine Day Filter (strictly filter to scheduled vendors if a specific day is selected)
    if (activeDay !== -1) {
      result = result.filter((s) => {
        const normalizedDays = normalizeOrderDays(s.order_days ?? (s as any).scheduled_order_days);
        return normalizedDays.includes(activeDay);
      });
    }

    // Gate 2: Shortage State & Inbox Zero Logic
    if (shortageFilterMode === "delta") {
      result = result.filter((s) => (s.delta_short_count ?? 0) > 0);
    } else if (shortageFilterMode === "staged") {
      result = result.filter(
        (s) => (s.staged_count ?? 0) > 0 || (s.ordered_count ?? 0) > 0 || Boolean(s.latest_draft_id)
      );
    } else {
      // Default "all" view in daily routine mode:
      // INBOX ZERO: If viewing a specific routine day (activeDay !== -1),
      // hide vendors whose shortages have already been 100% drafted/staged.
      if (activeDay !== -1) {
        result = result.filter((s) => (s.delta_short_count ?? 0) > 0);
      }
    }

    // Gate 3: Text Search Query Filter
    const q = searchQuery.toLowerCase().trim();
    if (!q) return result;

    return result.filter((s) => {
      const matchesName = s.supplier_name?.toLowerCase().includes(q);
      const matchesSr = s.sr_name?.toLowerCase().includes(q);
      const matchesBrand = s.linked_manufacturer_names?.some((b: string) =>
        b.toLowerCase().includes(q)
      );
      const matchesItem = s.items?.some(
        (it) =>
          it.medicine_name?.toLowerCase().includes(q) ||
          (it.generic_name && it.generic_name.toLowerCase().includes(q))
      );
      return Boolean(matchesName || matchesSr || matchesBrand || matchesItem);
    });
  }, [suppliersData, activeDay, shortageFilterMode, searchQuery]);

  // Scoped suppliers for the selected routine day (synchronizes header metrics & tab counts)
  const scopedSuppliersForDay = useMemo(() => {
    if (activeDay === -1) return suppliersData;
    return suppliersData.filter((s) => {
      const normalizedDays = normalizeOrderDays(s.order_days ?? (s as any).scheduled_order_days);
      return normalizedDays.includes(activeDay);
    });
  }, [suppliersData, activeDay]);

  // Synchronized metrics calculated strictly from scopedSuppliersForDay
  const {
    totalShortMedicines,
    totalDeltaShortMedicines,
    totalStagedMedicines,
    totalOrderedMedicines,
    totalProjectedCost,
    totalDeltaProjectedCost,
    totalPipelineCost,
    suppliersWithDeltaCount,
    suppliersWithStagedCount,
    todaySuppliersCount,
  } = useMemo(() => {
    let allItemsCount = 0;
    let deltaCount = 0;
    let stagedCount = 0;
    let orderedCount = 0;
    let totalCost = 0;
    let deltaCost = 0;
    let pipelineCost = 0;
    let todayCount = 0;
    let suppWithDelta = 0;
    let suppWithStaged = 0;
    const distinctDrafts = new Set<string>();

    for (const sup of scopedSuppliersForDay) {
      if (sup.is_scheduled_today) todayCount++;
      if ((sup.delta_short_count ?? 0) > 0) suppWithDelta++;
      if ((sup.staged_count ?? 0) > 0 || (sup.ordered_count ?? 0) > 0 || Boolean(sup.latest_draft_id)) {
        suppWithStaged++;
      }
      if (sup.latest_draft_id) distinctDrafts.add(sup.latest_draft_id);

      for (const it of sup.items) {
        allItemsCount++;
        const lineTotal = calculateLineTotal(it);
        totalCost += lineTotal;

        if (it.lifecycle_status === "UNSTAGED_SHORTAGE") {
          deltaCount++;
          deltaCost += lineTotal;
        } else if (it.lifecycle_status === "STAGED_IN_DRAFT") {
          stagedCount++;
          pipelineCost += lineTotal;
        } else if (it.lifecycle_status === "ORDERED_IN_FLIGHT") {
          orderedCount++;
          pipelineCost += lineTotal;
        }
      }
    }

    return {
      totalShortMedicines: allItemsCount,
      totalDeltaShortMedicines: deltaCount,
      totalStagedMedicines: stagedCount,
      totalOrderedMedicines: orderedCount,
      totalProjectedCost: totalCost,
      totalDeltaProjectedCost: deltaCost,
      totalPipelineCost: pipelineCost,
      suppliersWithDeltaCount: suppWithDelta,
      suppliersWithStagedCount: suppWithStaged,
      activeDraftsCount: distinctDrafts.size,
      todaySuppliersCount: todayCount,
    };
  }, [scopedSuppliersForDay]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-5xl mx-auto px-4 py-5 pb-28">
      {/* Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-purple-100 text-purple-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Smart SR Order Planner
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated stock replenishment staged to manufacturer visit routines
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* View Mode Toggle: Planner vs Saved History */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("planner")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "planner"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Shortage Planner
            </button>
            <button
              type="button"
              onClick={() => setViewMode("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "history"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Saved Requisitions
            </button>
          </div>

          {/* Compact Routine Day Selector Dropdown */}
          {viewMode === "planner" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 rounded-xl bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-xs text-xs font-semibold"
                >
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span>{activeDayTriggerLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-lg border-slate-200">
                <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                  Vendor Visit Routine
                </DropdownMenuLabel>

                {/* Quick Today's Routine Option */}
                <DropdownMenuItem
                  onClick={() => setActiveDay(todayDayIndex)}
                  className={`rounded-xl px-2.5 py-2 text-xs flex items-center justify-between cursor-pointer font-medium ${
                    activeDay === todayDayIndex
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Today's Routine ({todayDayName})</span>
                  </div>
                  {activeDay === todayDayIndex && <Check className="h-4 w-4 text-blue-600" />}
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1 bg-slate-100" />

                {/* 7 Days of the Week */}
                {DAYS_OF_WEEK.map(({ day, label, short }) => {
                  const isSelected = activeDay === day;
                  const isToday = day === todayDayIndex;
                  return (
                    <DropdownMenuItem
                      key={day}
                      onClick={() => setActiveDay(day)}
                      className={`rounded-xl px-2.5 py-1.5 text-xs flex items-center justify-between cursor-pointer font-medium ${
                        isSelected
                          ? "bg-blue-50 text-blue-700 font-bold"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400 w-6">{short}</span>
                        <span>{label}</span>
                        {isToday && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                            Today
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                    </DropdownMenuItem>
                  );
                })}

                <DropdownMenuSeparator className="my-1 bg-slate-100" />

                {/* All Scheduled Option */}
                <DropdownMenuItem
                  onClick={() => setActiveDay(-1)}
                  className={`rounded-xl px-2.5 py-2 text-xs flex items-center justify-between cursor-pointer font-medium ${
                    activeDay === -1
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-purple-600" />
                    <span>All Scheduled Vendors</span>
                  </div>
                  {activeDay === -1 && <Check className="h-4 w-4 text-blue-600" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/procurement/purchase-orders")}
            className="rounded-xl border-slate-200 text-slate-700 bg-white h-9 px-3 gap-1.5 text-xs font-semibold hover:bg-slate-50"
          >
            <Truck className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Purchase Invoices</span>
          </Button>
        </div>
      </div>

      {viewMode === "planner" ? (
        <>

          {/* Quick Metrics (Delta Shortages vs Projected Cost) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Delta Shortages (Action Needed)
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-bold text-rose-600 block">
                    {totalDeltaShortMedicines} items
                  </span>
                  {totalStagedMedicines + totalOrderedMedicines > 0 && (
                    <span className="text-[11px] text-purple-600 font-medium">
                      ({totalStagedMedicines + totalOrderedMedicines} staged)
                    </span>
                  )}
                </div>
              </div>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <Zap className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Est. Delta Order Cost
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-lg font-bold text-slate-900 block">
                    ৳ {totalDeltaProjectedCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  {totalPipelineCost > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[110px]" title={`৳ ${totalPipelineCost.toLocaleString("en-IN", { minimumFractionDigits: 0 })} in active drafts`}>
                      + ৳ {totalPipelineCost.toLocaleString("en-IN", { minimumFractionDigits: 0 })} staged
                    </span>
                  )}
                </div>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Receipt className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Quick Filter Strip & Real-time Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-4">
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 border border-slate-200 text-xs font-semibold gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setShortageFilterMode("all")}
                className={`px-3 py-1 rounded-lg transition-all text-xs whitespace-nowrap ${
                  shortageFilterMode === "all"
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Vendors ({scopedSuppliersForDay.length})
              </button>
              <button
                type="button"
                onClick={() => setShortageFilterMode("delta")}
                className={`px-3 py-1 rounded-lg transition-all text-xs flex items-center gap-1 whitespace-nowrap ${
                  shortageFilterMode === "delta"
                    ? "bg-white text-rose-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-rose-600" />
                <span>Needs Order ({suppliersWithDeltaCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setShortageFilterMode("staged")}
                className={`px-3 py-1 rounded-lg transition-all text-xs flex items-center gap-1 whitespace-nowrap ${
                  shortageFilterMode === "staged"
                    ? "bg-white text-purple-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5 text-purple-600" />
                <span>In Drafts ({suppliersWithStagedCount})</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Filter medicine or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl border-slate-200 bg-white"
              />
            </div>
          </div>

          {/* Main Staging List by Supplier */}
          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
              <div className="animate-spin h-8 w-8 border-3 border-purple-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-700">Calculating inventory deficits...</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Comparing current shelf stock with par levels and scheduled representative days
              </p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 sm:p-10 text-center border border-slate-200 shadow-xs max-w-lg mx-auto my-4">
              {scopedSuppliersForDay.some((s) => (s.staged_count ?? 0) > 0 || Boolean(s.latest_draft_id)) && activeDay !== -1 ? (
                <>
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-2xs">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    All Scheduled Orders Staged! 🎉
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1.5 mb-5 leading-relaxed">
                    All routine supplier requisitions for <strong>{activeDayTriggerLabel}</strong> have been drafted or shared. No pending shortages remain in your action inbox.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                    <Button
                      size="sm"
                      onClick={() => setViewMode("history")}
                      className="w-full sm:w-auto rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 px-4 font-semibold gap-1.5 shadow-xs"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      <span>View Saved Requisitions</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveDay(-1)}
                      className="w-full sm:w-auto rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3.5 font-medium"
                    >
                      View All Weekday Vendors
                    </Button>
                  </div>
                </>
              ) : scopedSuppliersForDay.length === 0 && activeDay !== -1 ? (
                <>
                  <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Calendar className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No Suppliers Scheduled</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    No pharmaceutical suppliers or representatives are scheduled for this day's routine.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveDay(-1)}
                      className="rounded-xl text-xs h-8 border-slate-200 hover:bg-slate-50 font-semibold"
                    >
                      View All Scheduled Vendors
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate("/procurement/suppliers")}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 font-semibold"
                    >
                      Manage Supplier Routine
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Optimal Stock Level!</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    All monitored medicines are currently above their reorder threshold.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveDay(-1)}
                      className="rounded-xl text-xs h-8 border-slate-200 hover:bg-slate-50 font-semibold"
                    >
                      View All Days
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate("/procurement/suppliers")}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 font-semibold"
                    >
                      Manage Supplier Routine
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSuppliers.map((supplier) => {
                const selectedItems = supplier.items.filter((it) => it.is_selected);
                const supplierSubtotal = selectedItems.reduce(
                  (sum, it) => sum + calculateLineTotal(it),
                  0
                );
                const isDraftSaved = Boolean(savedSupplierIds[supplier.supplier_id]);

                // Extract a concise draft ID (e.g. "CVB3" from "REQ-20261007-CVB3")
                const shortDraftId = supplier.latest_draft_number
                  ? supplier.latest_draft_number.includes("-")
                    ? supplier.latest_draft_number.split("-").pop() || supplier.latest_draft_number
                    : supplier.latest_draft_number.length > 6
                      ? supplier.latest_draft_number.slice(-4)
                      : supplier.latest_draft_number
                  : null;

                const isUnlinked = Boolean(supplier.linked_manufacturer_ids && supplier.linked_manufacturer_ids.length === 0);
                const hasDelta = supplier.delta_short_count > 0;
                const hasStaged = supplier.staged_count > 0 || supplier.ordered_count > 0;

                return (
                  <div
                    key={supplier.supplier_id}
                    className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 shadow-xs p-4 sm:p-5 transition-all space-y-3.5"
                  >
                    {/* SECTION 1: Top Identity & Vendor Header */}
                    <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 shrink-0 mt-0.5 border border-purple-100/80">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900 truncate">
                              {supplier.supplier_name}
                            </h3>
                            {supplier.is_scheduled_today && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px] gap-1 px-2 shadow-none shrink-0">
                                <Clock className="h-3 w-3" /> Scheduled Today
                              </Badge>
                            )}
                            {isDraftSaved && (
                              <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-bold text-[10px] gap-1 px-2 shadow-none shrink-0">
                                <CheckCircle2 className="h-3 w-3 text-purple-600" /> Draft Saved
                              </Badge>
                            )}
                          </div>

                          {/* SR Contact Strip */}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 flex-wrap">
                            {supplier.sr_name && (
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                <span>{supplier.sr_name}</span>
                              </span>
                            )}
                            {supplier.sr_phone && (
                              <a
                                href={`tel:${supplier.sr_phone}`}
                                className="flex items-center gap-1 hover:text-blue-600 text-slate-500 transition-colors"
                              >
                                <Phone className="h-3 w-3" />
                                <span>{supplier.sr_phone}</span>
                              </a>
                            )}
                            {supplier.sr_whatsapp && (
                              supplier.latest_draft_id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleGenerateAndShareLink(
                                      {
                                        reqId: supplier.latest_draft_id!,
                                        reqNumber: supplier.latest_draft_number || "REQ",
                                        supplierId: supplier.supplier_id,
                                        supplierName: supplier.supplier_name,
                                        srName: supplier.sr_name,
                                        srWhatsApp: supplier.sr_whatsapp,
                                        totalAmount: supplier.total_estimated_value,
                                        itemCount: supplier.staged_count || supplier.items.length,
                                        status: "draft",
                                      },
                                      true
                                    )
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                                  title="Dispatch active requisition order to SR via WhatsApp"
                                >
                                  <MessageCircle className="h-3 w-3 text-emerald-600" />
                                  <span>WhatsApp SR</span>
                                </button>
                              ) : (
                                <a
                                  href={`https://wa.me/${supplier.sr_whatsapp.replace(/[^0-9]/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                  title="Open WhatsApp chat with SR"
                                >
                                  <MessageCircle className="h-3 w-3 text-emerald-600" />
                                  <span>WhatsApp SR</span>
                                </a>
                              )
                            )}
                          </div>

                          {/* Brand Representation Tags / Unlinked warning */}
                          {isUnlinked ? (
                            <button
                              type="button"
                              onClick={() => navigate("/procurement/suppliers")}
                              className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors group cursor-pointer text-left"
                              title="Open Suppliers page to link manufacturers"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span>No manufacturers linked. Click to link companies to auto-detect shortages.</span>
                              <ExternalLink className="h-3 w-3 text-amber-500 opacity-70 group-hover:opacity-100" />
                            </button>
                          ) : (
                            supplier.linked_manufacturer_names && supplier.linked_manufacturer_names.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-2">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Brands:</span>
                                {supplier.linked_manufacturer_names.slice(0, 3).map((name, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200/50"
                                  >
                                    {name}
                                  </span>
                                ))}
                                {supplier.linked_manufacturer_names.length > 3 && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    +{supplier.linked_manufacturer_names.length - 3} more
                                  </span>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: Dedicated Clean Status Strip */}
                    <div className="py-2 px-3 rounded-xl bg-slate-50/90 border border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
                      {isUnlinked ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-0.5 rounded-lg text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>Unlinked Vendor — Shortage Scan Paused</span>
                          </span>
                        </div>
                      ) : hasDelta ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-lg text-xs">
                            <Zap className="h-3.5 w-3.5 text-rose-600" />
                            <span>{supplier.delta_short_count} New Delta {supplier.delta_short_count === 1 ? "Shortage" : "Shortages"}</span>
                          </span>
                          {hasStaged && (
                            <span
                              title={supplier.latest_draft_number ? `Draft Requisition #${supplier.latest_draft_number}` : undefined}
                              className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-lg text-xs"
                            >
                              <ClipboardList className="h-3.5 w-3.5 text-purple-600" />
                              <span>Draft: #{shortDraftId || supplier.latest_draft_number}</span>
                            </span>
                          )}
                        </div>
                      ) : hasStaged ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>All Shortages Staged</span>
                          </span>
                          <span
                            title={supplier.latest_draft_number ? `Draft Requisition #${supplier.latest_draft_number}` : undefined}
                            className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-lg text-xs"
                          >
                            <ClipboardList className="h-3.5 w-3.5 text-purple-600" />
                            <span>Draft: #{shortDraftId || supplier.latest_draft_number}</span>
                          </span>
                        </div>
                      ) : supplier.items.length > 0 ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            <span>{supplier.items.length} Shortage {supplier.items.length === 1 ? "Item" : "Items"}</span>
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Optimal Stock — No Shortages Detected</span>
                          </span>
                        </div>
                      )}

                      {/* Right side summary in status strip */}
                      <div className="text-[11px] text-slate-500 font-medium hidden sm:flex items-center gap-1">
                        <span>{supplier.items.length} {supplier.items.length === 1 ? "item" : "items"} evaluated</span>
                      </div>
                    </div>

                    {/* SECTION 3: Balanced Action Footer */}
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                      {/* Left: Counts and formatted currency */}
                      <div className="min-w-0">
                        {isUnlinked ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              0 Items Detected
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-xl font-extrabold text-slate-400">৳ 0.00</span>
                              <span className="text-[11px] text-amber-700 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                Linking Required
                              </span>
                            </div>
                          </div>
                        ) : hasDelta ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">
                              {supplier.delta_short_count} New {supplier.delta_short_count === 1 ? "Item" : "Items"}
                              {supplier.staged_count > 0 ? ` (${supplier.staged_count} Staged)` : ""}
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                                ৳ {supplier.delta_estimated_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Est. Delta Reorder
                              </span>
                            </div>
                          </div>
                        ) : hasStaged ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                              {supplier.staged_count} Staged {supplier.staged_count === 1 ? "Item" : "Items"}
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                                ৳ {supplier.total_estimated_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Staged Draft Value
                              </span>
                            </div>
                          </div>
                        ) : supplier.items.length > 0 ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                              {supplier.items.length} Short {supplier.items.length === 1 ? "Item" : "Items"}
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                                ৳ {supplier.total_estimated_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Estimated Reorder Cost
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                              0 Short Items
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-xl font-extrabold text-slate-900 tracking-tight">৳ 0.00</span>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Optimal Stock
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Clean, responsive action button */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isUnlinked ? (
                          <Button
                            variant="outline"
                            onClick={() => navigate("/procurement/suppliers")}
                            className="w-full sm:w-auto border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-800 text-xs font-semibold h-10 px-4 rounded-xl gap-2 shadow-2xs cursor-pointer"
                          >
                            <Building2 className="h-4 w-4 text-amber-600" />
                            <span>Link Brands</span>
                            <ExternalLink className="h-3.5 w-3.5 text-amber-600" />
                          </Button>
                        ) : hasDelta ? (
                          <Button
                            onClick={() => {
                              setActiveSupplierId(supplier.supplier_id);
                              setMedSearchQuery("");
                              setMedSearchResults([]);
                            }}
                            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs text-xs font-semibold h-10 px-4 gap-2 cursor-pointer transition-all"
                          >
                            <Zap className="h-4 w-4 fill-white/20" />
                            <span>Review Delta (+{supplier.delta_short_count})</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : hasStaged ? (
                          <Button
                            onClick={() => {
                              setActiveSupplierId(supplier.supplier_id);
                              setMedSearchQuery("");
                              setMedSearchResults([]);
                            }}
                            variant="outline"
                            className="w-full sm:w-auto border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl shadow-2xs text-xs font-semibold h-10 px-4 gap-2 cursor-pointer transition-all"
                          >
                            <ClipboardList className="h-4 w-4 text-purple-600" />
                            <span>View Draft</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : supplier.items.length > 0 ? (
                          <Button
                            onClick={() => {
                              setActiveSupplierId(supplier.supplier_id);
                              setMedSearchQuery("");
                              setMedSearchResults([]);
                            }}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs text-xs font-semibold h-10 px-4 gap-2 cursor-pointer transition-all"
                          >
                            <ClipboardList className="h-4 w-4" />
                            <span>View & Edit Order</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              setActiveSupplierId(supplier.supplier_id);
                              setMedSearchQuery("");
                              setMedSearchResults([]);
                            }}
                            variant="outline"
                            className="w-full sm:w-auto border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium h-10 px-4 gap-2 cursor-pointer transition-all"
                          >
                            <ClipboardList className="h-4 w-4 text-slate-400" />
                            <span>View Catalog</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Saved Requisitions History View */
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Saved Requisition Registry</h3>
              <p className="text-xs text-slate-500">
                Tracked procurement drafts ready for SR sharing or conversion to invoice
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchSavedRequisitions}
              className="rounded-xl border-slate-200 text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingSaved ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>

          {loadingSaved ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <div className="animate-spin h-6 w-6 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2" />
              Loading saved orders...
            </div>
          ) : savedRequisitions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              No requisitions saved yet. Stage shortages from the Shortage Planner above!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {savedRequisitions.map((req) => {
                const activeToken = req.requisition_magic_links?.[0]?.token;
                const isAcknowledged = req.status === "confirmed" || Boolean(req.requisition_magic_links?.[0]?.sr_acknowledged_at);
                const isSharingThis = sharingReqId === req.id;

                return (
                  <div
                    key={req.id}
                    className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                          {req.requisition_number}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {req.suppliers?.name || "Vendor"}
                        </h4>

                        {/* Status Badges */}
                        {req.status === "confirmed" || isAcknowledged ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1 shadow-none font-bold">
                            <CheckCheck className="h-3 w-3" /> Confirmed by SR
                          </Badge>
                        ) : req.status === "shared" ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] gap-1 shadow-none font-semibold">
                            <Clock className="h-3 w-3" /> Shared with SR
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">
                            Draft
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span>
                          {req.requisition_items?.length || 0} line items • Created on{" "}
                          {new Date(req.created_at).toLocaleDateString()}
                        </span>
                        {req.suppliers?.sr_name && (
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <UserCheck className="h-3 w-3 text-emerald-600" />
                            <span>{req.suppliers.sr_name}</span>
                          </span>
                        )}
                      </div>

                      {/* Rep Delivery Feedback Note */}
                      {req.requisition_magic_links?.[0]?.sr_notes && (
                        <p className="mt-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg font-medium inline-block">
                          SR Note: "{req.requisition_magic_links[0].sr_notes}"
                        </p>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      <div className="text-left md:text-right pr-2">
                        <span className="text-sm font-bold text-slate-900 block">
                          ৳ {Number(req.total_estimated_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-slate-400 block">Estimated Amount</span>
                      </div>

                      {/* Action 1: Receive Goods (Convert to PO / Invoice) */}
                      {req.status === "converted_to_po" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          <CheckCheck className="h-3.5 w-3.5 text-purple-600" />
                          <span>Received (PO)</span>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleConvertToPO(req)}
                          className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-2.5 gap-1.5 shadow-xs font-semibold"
                          title="Convert requisition into direct goods receipt (Purchase Order)"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          <span>Receive Goods</span>
                        </Button>
                      )}

                      {/* Action 2: Share via WhatsApp */}
                      <Button
                        size="sm"
                        disabled={isSharingThis}
                        onClick={() => handleGenerateAndShareLink(req, true)}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-2.5 gap-1.5 shadow-xs font-semibold"
                        title="Dispatch formatted order summary & magic portal link to SR via WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isSharingThis ? "Opening..." : "Share WhatsApp"}
                        </span>
                      </Button>

                      {/* Action 3: Copy Magic Link & Order Summary */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSharingThis}
                        onClick={() => handleGenerateAndShareLink(req, false)}
                        className="rounded-xl border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs h-8 px-2.5 gap-1.5"
                        title="Copy full order summary & magic link to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>

                      {/* Action 4: Review Order Items (In-App Sheet Modal) */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewReq(req)}
                        className="rounded-xl border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs h-8 px-2.5 gap-1.5"
                        title="Review Requisition Line Items & Delivery Status"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-600" />
                        <span className="hidden sm:inline">Review</span>
                      </Button>

                      {/* Action 5: Open Public Slip */}
                      {activeToken && (
                        <a
                          href={`/order/${activeToken}${
                            branchName
                              ? `?branch=${encodeURIComponent(branchName)}&addr=${encodeURIComponent(
                                  branchAddress || ""
                                )}&phone=${encodeURIComponent(branchPhone || "")}`
                              : ""
                          }`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Open Public SR Portal Slip"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ORDER EDITOR MODAL / SHEET (MASTER-DETAIL PATTERN) */}
      <Dialog
        open={Boolean(activeSupplier)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveSupplierId(null);
            setMedSearchQuery("");
            setMedSearchResults([]);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-3xl lg:max-w-4xl min-w-0 rounded-2xl p-3.5 sm:p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden box-border">
          {activeSupplier && (
            <div className="w-full min-w-0 space-y-4">
              {/* Header */}
              <DialogHeader className="w-full min-w-0 pb-3 border-b border-slate-100 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="p-1.5 rounded-xl bg-purple-50 text-purple-700 shrink-0">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 truncate">
                        {activeSupplier.supplier_name}
                      </DialogTitle>
                      {activeSupplier.is_scheduled_today && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px] gap-1 px-2 shadow-none shrink-0">
                          <Clock className="h-3 w-3" /> Scheduled Today
                        </Badge>
                      )}
                      {activeSupplier.latest_draft_id && (
                        <Badge className="bg-purple-100 text-purple-800 border-purple-300 font-bold text-[10px] gap-1 px-2 shadow-none shrink-0">
                          <ClipboardList className="h-3 w-3" /> Draft #{activeSupplier.latest_draft_number} ({activeSupplier.staged_count} staged)
                        </Badge>
                      )}
                    </div>

                    {/* SR Contact Details */}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 flex-wrap min-w-0">
                      {activeSupplier.sr_name && (
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>SR: {activeSupplier.sr_name}</span>
                        </span>
                      )}
                      {activeSupplier.sr_phone && (
                        <a
                          href={`tel:${activeSupplier.sr_phone}`}
                          className="flex items-center gap-1 hover:text-blue-600 text-slate-500 transition-colors"
                        >
                          <Phone className="h-3 w-3" />
                          <span>{activeSupplier.sr_phone}</span>
                        </a>
                      )}
                      {activeSupplier.sr_whatsapp && (
                        <a
                          href={`https://wa.me/${activeSupplier.sr_whatsapp.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          <MessageCircle className="h-3 w-3 text-emerald-600" />
                          <span>WhatsApp SR</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Header Summary Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-left sm:text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Selected Items
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {activeSupplier.items.filter((it) => it.is_selected).length} / {activeSupplier.items.length}
                      </span>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-xl text-left sm:text-right">
                      <span className="text-[10px] text-purple-600 uppercase font-semibold block">
                        Order Estimate
                      </span>
                      <span className="text-xs font-bold text-purple-900">
                        ৳{" "}
                        {activeSupplier.items
                          .filter((it) => it.is_selected)
                          .reduce((sum, it) => sum + calculateLineTotal(it), 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Manual Search & Quick Add Section */}
              <div className="w-full min-w-0 relative">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search & add extra medicine to this order (e.g. Napa, Seclo)..."
                    value={medSearchQuery}
                    onChange={(e) => setMedSearchQuery(e.target.value)}
                    className="pl-9 pr-8 h-9 text-xs rounded-xl border-slate-200 bg-slate-50/70 focus:bg-white w-full"
                  />
                  {medSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setMedSearchQuery("");
                        setMedSearchResults([]);
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Results Popover */}
                {isSearchingMeds && (
                  <div className="mt-1 p-2 bg-white rounded-xl border border-slate-200 shadow-md text-xs text-slate-500 flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    Searching inventory...
                  </div>
                )}

                {!isSearchingMeds && medSearchResults.length > 0 && (
                  <div className="mt-1.5 p-1.5 bg-white rounded-xl border border-slate-200 shadow-xl divide-y divide-slate-100 max-h-56 overflow-y-auto z-20 relative">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      Matching Medicines (Click + Add to include)
                    </div>
                    {medSearchResults.map((med) => {
                      const isAlreadyIn = activeSupplier.items.some((it) => it.medicine_id === med.id);
                      return (
                        <div
                          key={med.id}
                          onClick={() => {
                            if (!isAlreadyIn) {
                              handleAddMedicineToSupplier(activeSupplier.supplier_id, med);
                              setMedSearchQuery("");
                              setMedSearchResults([]);
                            }
                          }}
                          className={`p-2 flex items-center justify-between rounded-lg cursor-pointer transition-colors ${
                            isAlreadyIn ? "bg-slate-50 opacity-60 cursor-not-allowed" : "hover:bg-blue-50/70"
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-xs text-slate-900 truncate">{med.name}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {med.generic_name} {med.company_name ? `• ${med.company_name}` : ""}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Stock: {med.stock_quantity || 0} pcs • Alert: {med.stock_alert || 10} pcs • TP: ৳
                              {Number(med.price ? med.price * 0.88 : 10).toFixed(1)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            {isAlreadyIn ? (
                              <span className="text-[10px] font-bold text-slate-400">Already in Order</span>
                            ) : (
                              <Button
                                size="sm"
                                type="button"
                                className="h-7 px-2.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-1 shadow-none"
                              >
                                <Plus className="h-3 w-3" /> Add
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Medicine Items List */}
              <div className="w-full min-w-0 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pb-1.5 border-b border-slate-100 min-w-0 gap-2">
                  <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                    Medicines to Order ({activeSupplier.items.length})
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeSupplier.delta_short_count > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSuppliersData((prev) =>
                            prev.map((s) =>
                              s.supplier_id === activeSupplier.supplier_id
                                ? {
                                    ...s,
                                    items: s.items.map((it) => ({
                                      ...it,
                                      is_selected: it.lifecycle_status === "UNSTAGED_SHORTAGE",
                                    })),
                                  }
                                : s
                            )
                          );
                        }}
                        className="text-[11px] font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded-lg border border-rose-200 flex items-center gap-1 transition-colors"
                      >
                        <Zap className="h-3 w-3 text-rose-600" />
                        <span>Select Delta Only ({activeSupplier.delta_short_count})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = activeSupplier.items.every((it) => it.is_selected);
                        setSuppliersData((prev) =>
                          prev.map((s) =>
                            s.supplier_id === activeSupplier.supplier_id
                              ? {
                                  ...s,
                                  items: s.items.map((it) => ({ ...it, is_selected: !allSelected })),
                                }
                              : s
                          )
                        );
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 underline"
                    >
                      {activeSupplier.items.every((it) => it.is_selected) ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                </div>

                {activeSupplier.items.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No medicines in this order draft</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Use the search bar above to manually add items
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[48vh] overflow-y-auto pr-1">
                    {[...activeSupplier.items]
                      .sort((a, b) => {
                        if (a.lifecycle_status === "UNSTAGED_SHORTAGE" && b.lifecycle_status !== "UNSTAGED_SHORTAGE") return -1;
                        if (a.lifecycle_status !== "UNSTAGED_SHORTAGE" && b.lifecycle_status === "UNSTAGED_SHORTAGE") return 1;
                        return a.medicine_name.localeCompare(b.medicine_name);
                      })
                      .map((item) => {
                      const totalPieces = calculateTotalPieces(item);
                      const lineTotal = calculateLineTotal(item);

                      return (
                        <div
                          key={item.medicine_id}
                          className={`py-3 first:pt-1 last:pb-1 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-opacity ${
                            item.is_selected ? "opacity-100" : "opacity-45"
                          }`}
                        >
                          {/* Item Identity & Stock Deficit */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={item.is_selected}
                              onChange={() =>
                                handleToggleItemSelection(activeSupplier.supplier_id, item.medicine_id)
                              }
                              className="mt-1 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-slate-900 leading-tight truncate">
                                  {item.medicine_name}
                                </h4>
                                {item.company_name && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                                    {item.company_name}
                                  </span>
                                )}

                                {item.lifecycle_status === "UNSTAGED_SHORTAGE" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1 shadow-none">
                                    <Zap className="h-3 w-3 text-rose-600" /> Delta Shortage
                                  </span>
                                )}
                                {item.lifecycle_status === "STAGED_IN_DRAFT" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1 shadow-none">
                                    <ClipboardList className="h-3 w-3 text-purple-600" />
                                    Staged in {item.active_in_flight_ref?.requisition_number || "Draft"} ({item.active_in_flight_ref?.ordered_qty_pcs || 0} pcs)
                                  </span>
                                )}
                                {item.lifecycle_status === "ORDERED_IN_FLIGHT" && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1 shadow-none">
                                    <Truck className="h-3 w-3 text-blue-600" />
                                    Ordered ({item.active_in_flight_ref?.requisition_number || "In Pipeline"})
                                  </span>
                                )}
                              </div>
                              {item.generic_name && (
                                <div className="text-xs text-slate-500 italic mt-0.5 truncate">
                                  {item.generic_name}
                                </div>
                              )}

                              {/* Deficit Badge */}
                              <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap">
                                <span className="text-slate-500">
                                  Stock:{" "}
                                  <strong className="text-rose-600 font-semibold">
                                    {item.current_stock_pcs} pcs
                                  </strong>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-500">
                                  Reorder Level: <strong>{item.reorder_level_pcs} pcs</strong>
                                </span>
                                {item.pieces_per_box > 1 && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-400 font-mono text-[10px]">
                                      ({item.strip_per_pack}s × {item.pcs_per_strip}p = {item.pieces_per_box} pcs/box)
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Pack Mode Selector, Stepper, Line Total & Remove Action */}
                          <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0 pl-7 md:pl-0 flex-wrap sm:flex-nowrap">
                            {/* Pack Mode Chips (Box vs Strip vs Piece) */}
                            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                              {item.pieces_per_box > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePackModeToggle(activeSupplier.supplier_id, item.medicine_id, "box")
                                  }
                                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                                    item.pack_mode === "box"
                                      ? "bg-white text-blue-700 shadow-xs"
                                      : "text-slate-500 hover:text-slate-800"
                                  }`}
                                >
                                  Box
                                </button>
                              )}
                              {item.pcs_per_strip > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePackModeToggle(activeSupplier.supplier_id, item.medicine_id, "strip")
                                  }
                                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                                    item.pack_mode === "strip"
                                      ? "bg-white text-blue-700 shadow-xs"
                                      : "text-slate-500 hover:text-slate-800"
                                  }`}
                                >
                                  Strip
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handlePackModeToggle(activeSupplier.supplier_id, item.medicine_id, "piece")
                                }
                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                                  item.pack_mode === "piece"
                                    ? "bg-white text-blue-700 shadow-xs"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                Pcs
                              </button>
                            </div>

                            {/* Stepper Control */}
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(activeSupplier.supplier_id, item.medicine_id, -1)
                                }
                                className="h-7 w-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
                              >
                                <Minus className="h-3 w-3" />
                              </button>

                              <div className="w-11 text-center">
                                <span className="text-xs font-bold text-slate-900 block leading-none">
                                  {item.pack_mode === "box"
                                    ? item.order_boxes
                                    : item.pack_mode === "strip"
                                    ? item.order_strips
                                    : item.order_pcs}
                                </span>
                                <span className="text-[9px] text-slate-400 block uppercase font-medium">
                                  {item.pack_mode}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(activeSupplier.supplier_id, item.medicine_id, 1)
                                }
                                className="h-7 w-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Subtotal & Total Pieces */}
                            <div className="text-right w-20 sm:w-24">
                              <span className="text-xs font-bold text-slate-900 block">
                                ৳ {lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 1 })}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                = {totalPieces} pcs
                              </span>
                            </div>

                            {/* Remove item button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(activeSupplier.supplier_id, item.medicine_id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Remove medicine from order draft"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal Footer: Instructions & Save Order Draft Action */}
              <div className="pt-3 border-t border-slate-100 space-y-3 w-full min-w-0">
                <Input
                  placeholder="Add requisition order instructions for representative..."
                  value={activeSupplier.notes}
                  onChange={(e) =>
                    handleSupplierNotesChange(activeSupplier.supplier_id, e.target.value)
                  }
                  className="h-9 text-xs rounded-xl bg-slate-50/70 border-slate-200 w-full"
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
                  <div className="text-left w-full sm:w-auto">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Total Order Estimate
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      ৳{" "}
                      {activeSupplier.items
                        .filter((it) => it.is_selected)
                        .reduce((sum, it) => sum + calculateLineTotal(it), 0)
                        .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveSupplierId(null)}
                      className="rounded-xl border-slate-200 text-xs h-9 px-4"
                    >
                      Close
                    </Button>

                    {activeSupplier.latest_draft_id && activeSupplier.delta_short_count > 0 ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            activeSupplier.is_saving ||
                            activeSupplier.items.filter((it) => it.is_selected).length === 0
                          }
                          onClick={() => handleSaveOrderDraft(activeSupplier, "supplementary")}
                          className="rounded-xl border-amber-300 bg-amber-50/50 hover:bg-amber-100 text-amber-800 text-xs font-semibold h-9 px-3 gap-1.5"
                          title="Create a separate supplementary order number"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>New Supplementary Order</span>
                        </Button>

                        <Button
                          size="sm"
                          disabled={
                            activeSupplier.is_saving ||
                            activeSupplier.items.filter((it) => it.is_selected).length === 0
                          }
                          onClick={() => handleSaveOrderDraft(activeSupplier, "append")}
                          className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs text-xs font-semibold h-9 px-4 gap-1.5 shrink-0"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          <span>
                            {activeSupplier.is_saving
                              ? "Updating Draft..."
                              : `Append to Draft #${activeSupplier.latest_draft_number || "REQ"}`}
                          </span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={
                          activeSupplier.is_saving ||
                          activeSupplier.items.filter((it) => it.is_selected).length === 0
                        }
                        onClick={() => handleSaveOrderDraft(activeSupplier, "auto")}
                        className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs text-xs font-semibold h-9 px-5 gap-1.5 shrink-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>
                          {activeSupplier.is_saving
                            ? "Saving Draft..."
                            : `Save Order Draft (${activeSupplier.items.filter((it) => it.is_selected).length})`}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success Modal after Saving Draft */}
      <Dialog open={savedModalOpen} onOpenChange={setSavedModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-2">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-slate-900">
              Requisition Order Draft Saved!
            </DialogTitle>
          </DialogHeader>

          {lastSavedSummary && (
            <div className="bg-slate-50 rounded-2xl p-4 my-2 text-xs space-y-2 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Issuing Branch:</span>
                <span className="font-semibold text-slate-900">{branchName || "Active Branch"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order Number:</span>
                <span className="font-mono font-bold text-purple-700">{lastSavedSummary.reqNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Supplier / Vendor:</span>
                <span className="font-semibold text-slate-800">{lastSavedSummary.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Selected Medicines:</span>
                <span className="font-semibold text-slate-800">{lastSavedSummary.itemCount} items</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-bold">Estimated Cost:</span>
                <span className="font-bold text-slate-900 text-sm">
                  ৳ {lastSavedSummary.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center mb-1">
            Requisition saved! Dispatch a secure, mobile-friendly Magic Link to the Representative now:
          </p>

          <DialogFooter className="pt-2 flex flex-col gap-2 sm:flex-col">
            {lastSavedSummary && (
              <>
                <Button
                  onClick={() => {
                    handleGenerateAndShareLink(lastSavedSummary, true);
                    setSavedModalOpen(false);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-10 gap-2 shadow-xs"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Share Order via WhatsApp to SR</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    handleGenerateAndShareLink(lastSavedSummary, false);
                  }}
                  className="w-full rounded-xl border-slate-200 text-slate-700 text-xs font-semibold h-9 gap-2"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Order Summary & Link</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setSavedModalOpen(false);
                    handleConvertToPO({
                      id: lastSavedSummary.reqId,
                      requisition_number: lastSavedSummary.reqNumber,
                      supplier_id: lastSavedSummary.supplierId,
                      requisition_items: [],
                    });
                  }}
                  className="w-full rounded-xl border-blue-200 text-blue-700 bg-blue-50/40 hover:bg-blue-100 text-xs font-semibold h-9 gap-2"
                >
                  <Truck className="h-3.5 w-3.5 text-blue-600" />
                  <span>Receive Goods into Stock (GRN)</span>
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              onClick={() => setSavedModalOpen(false)}
              className="w-full text-slate-500 text-xs h-8"
            >
              Continue Planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SAVED REQUISITION DETAIL REVIEW MODAL / SHEET */}
      <Dialog open={Boolean(reviewReq)} onOpenChange={(open) => !open && setReviewReq(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl min-w-0 rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          {reviewReq && (
            <div className="space-y-4">
              <DialogHeader className="pb-3 border-b border-slate-100 text-left">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                        {reviewReq.requisition_number}
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        {reviewReq.suppliers?.name || "Vendor"}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Created on {new Date(reviewReq.created_at).toLocaleDateString()}
                      {reviewReq.suppliers?.sr_name && ` • SR: ${reviewReq.suppliers.sr_name}`}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-sm font-bold text-slate-900 block">
                      ৳ {Number(reviewReq.total_estimated_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      Estimated Order Cost
                    </span>
                  </div>
                </div>
              </DialogHeader>

              {/* SR Delivery Notes if acknowledged */}
              {reviewReq.requisition_magic_links?.[0]?.sr_notes && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  <span className="font-bold block">Representative Note:</span>
                  <p className="mt-0.5">{reviewReq.requisition_magic_links[0].sr_notes}</p>
                </div>
              )}

              {/* Order Line Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-semibold">
                  <span>Ordered Medicines ({reviewReq.requisition_items?.length || 0})</span>
                  <span>Quantity</span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto">
                  {(reviewReq.requisition_items || []).map((it: any) => (
                    <div key={it.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-800 block truncate">{it.medicine_name}</span>
                        <span className="text-[10px] text-slate-400 capitalize">Pack: {it.pack_mode || "piece"}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                          {it.final_order_qty_pcs || 1} pcs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    handleGenerateAndShareLink(reviewReq, true);
                  }}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold gap-1.5"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Share WhatsApp</span>
                </Button>

                {reviewReq.status !== "converted_to_po" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setReviewReq(null);
                      handleConvertToPO(reviewReq);
                    }}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-semibold gap-1.5"
                  >
                    <Truck className="h-4 w-4" />
                    <span>Receive Goods (PO)</span>
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={() => setReviewReq(null)}
                  className="rounded-xl border-slate-200 text-slate-700 text-xs h-9"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
