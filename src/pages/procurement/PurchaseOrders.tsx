import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { warehouseStorage, PurchaseOrderRecord, PurchaseOrderItemRecord } from "@/services/warehouseStorage";
import {
  Plus,
  Search,
  ClipboardList,
  PackageCheck,
  Truck,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  AlertCircle,
  Eye,
  FileText,
  Send,
  Warehouse,
  Receipt,
  Percent,
  CreditCard,
  Gift,
  Sparkles,
  Upload,
  FileUp,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  Supplier,
} from "@/types/warehouseErp";

interface MedicineCatalogItem {
  id: string;
  name: string;
  price?: number;
  stock_quantity?: number;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// Helper to normalize any expiry format (YYYY-MM, MM/YYYY, etc.) to valid SQL date YYYY-MM-01 or null
function formatExpiryForDb(exp?: string | null): string | null {
  if (!exp || !String(exp).trim()) return null;
  const trimmed = String(exp).trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [m, y] = trimmed.split("/");
    return `${y}-${m.padStart(2, "0")}-01`;
  }
  if (/^\d{4}\/\d{1,2}$/.test(trimmed)) {
    const [y, m] = trimmed.split("/");
    return `${y}-${m.padStart(2, "0")}-01`;
  }
  return trimmed;
}

// Rich Line Item for Pharmaceutical Inward Invoices
export interface DraftPOItem {
  id: string;
  medicine_id?: string;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  trade_price: number;      // Wholesale Trade Price (TP)
  ordered_qty: number;      // Billed Quantity
  bonus_qty: number;        // Free units provided under pharma trade scheme
  discount_percent: number; // Item-level trade discount %
}

// Goods Received Note item for physical reconciliation
export interface GRNItemRow {
  item_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  ordered_qty: number;
  bonus_qty: number;
  received_qty: number;
  trade_price: number;
  batch_number: string;
  expiry_date: string;
}

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { activeLocation, locations } = useLocationStore();
  const { pharmacyId, branchId, branchName, isMainBranch } = useActiveWorkspace();

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "draft" | "received" | "cancelled">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Requisition conversion & reconciler tracking
  const [draftRequisitionId, setDraftRequisitionId] = useState<string | null>(null);
  const [requisitionOriginNumber, setRequisitionOriginNumber] = useState<string | null>(null);

  // In-PO Requisition Importer State
  const [importReqDialogOpen, setImportReqDialogOpen] = useState(false);
  const [pendingRequisitions, setPendingRequisitions] = useState<any[]>([]);
  const [loadingPendingReqs, setLoadingPendingReqs] = useState(false);

  // Medicine catalog for autocomplete
  const [catalogOptions, setCatalogOptions] = useState<MedicineCatalogItem[]>([]);

  // Dialog States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [grnDialogOpen, setGrnDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, { batch?: boolean; expiry?: boolean }>>({});

  // Custom Expiry Month-Year Picker Dialog State
  const [expiryPickerOpen, setExpiryPickerOpen] = useState(false);
  const [expiryPickerItemId, setExpiryPickerItemId] = useState<string | null>(null);
  const [expiryPickerYear, setExpiryPickerYear] = useState<number>(new Date().getFullYear());
  const [expiryPickerMonth, setExpiryPickerMonth] = useState<number>(new Date().getMonth());

  // AI Invoice Scanner State
  const [isScanMode, setIsScanMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanFileName, setScanFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draft Invoice Form State
  const [draftSupplierId, setDraftSupplierId] = useState("");
  const [draftWarehouseId, setDraftWarehouseId] = useState("");
  const [draftInvoiceNumber, setDraftInvoiceNumber] = useState("");
  const [draftOrderDate, setDraftOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [draftExpectedDate, setDraftExpectedDate] = useState("");
  const [draftInvoiceDiscount, setDraftInvoiceDiscount] = useState<number>(0);
  const [draftVatAmount, setDraftVatAmount] = useState<number>(0);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftPOItem[]>([
    {
      id: "item_1",
      medicine_name: "Napa Extra 500mg Tablet",
      batch_number: "NE-2026-A1",
      expiry_date: "2027-12",
      trade_price: 2.5,
      ordered_qty: 100,
      bonus_qty: 10,
      discount_percent: 5,
    },
    {
      id: "item_2",
      medicine_name: "Seclo 20mg Capsule",
      batch_number: "SC-9810",
      expiry_date: "2028-06",
      trade_price: 6.0,
      ordered_qty: 80,
      bonus_qty: 0,
      discount_percent: 2,
    },
  ]);

  // Active focal item ID for accordion behavior
  const [expandedItemId, setExpandedItemId] = useState<string | null>(() => "item_1");
  // Input ref dictionary for auto-focusing
  const medicineInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // GRN Modal State
  const [grnItems, setGrnItems] = useState<GRNItemRow[]>([]);

  // Eligible Godown/Warehouse Locations
  const warehouseLocations = useMemo(() => {
    const godowns = locations.filter(
      (loc) => loc.type === "warehouse" || (loc.type as string) === "godown"
    );
    return godowns.length > 0 ? godowns : locations;
  }, [locations]);

  // Fetch Suppliers, Catalog & Existing POs
  const fetchData = useCallback(async () => {
    if (!pharmacyId) return;
    try {
      setLoading(true);

      // 1. Fetch Suppliers strictly scoped to active branch
      const sups = await warehouseStorage.getSuppliers(pharmacyId, branchId);
      if (sups) setSuppliers(sups as Supplier[]);

      // 2. Fetch Catalog for Autocomplete
      const { data: meds } = await supabase
        .from("medicines")
        .select("id, name, price, stock_quantity")
        .eq("pharmacy_id", pharmacyId)
        .order("name", { ascending: true })
        .limit(200);

      if (meds) {
        setCatalogOptions(
          meds.map((m: any) => ({
            id: m.id,
            name: m.name,
            price: Number(m.price) || 0,
            stock_quantity: Number(m.stock_quantity) || 0,
          }))
        );
      }

      // 3. Fetch Purchase Orders (scoped to active branch workspace)
      const pos = await warehouseStorage.getPurchaseOrders(pharmacyId, branchId);
      setPurchaseOrders((pos as any) || []);
    } catch (err: any) {
      console.warn("[PurchaseOrders] fetchData error:", err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [pharmacyId, branchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Listen to global workspace change events (dispatched by LocationContext / ActiveBranchCard)
  useEffect(() => {
    const handleWorkspaceChanged = () => {
      fetchData();
    };
    window.addEventListener("medinist:workspace-changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("medinist:workspace-changed", handleWorkspaceChanged);
    };
  }, [fetchData]);

  // Requisition Hydration helper: maps a requisition record and items into Draft PO state
  const hydrateFromRequisitionRecord = useCallback(
    (req: any, showToast = true) => {
      setDraftRequisitionId(req.id || null);
      setRequisitionOriginNumber(req.requisition_number || null);

      const targetSupplierId = req.supplier_id || req.suppliers?.id || "";
      if (targetSupplierId) {
        setDraftSupplierId(targetSupplierId);
      }

      const cleanNum = req.requisition_number
        ? `INV-${req.requisition_number.replace("REQ-", "")}`
        : `INV-${Date.now().toString().slice(-6)}`;
      setDraftInvoiceNumber(cleanNum);
      setDraftOrderDate(new Date().toISOString().split("T")[0]);
      if (req.notes) {
        setDraftNotes(req.notes);
      }

      const rawItems = req.requisition_items || req.items || [];
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        const mappedFromReq: DraftPOItem[] = rawItems.map((it: any, idx: number) => ({
          id: `req_item_${Date.now()}_${idx}`,
          medicine_id: it.medicine_id || undefined,
          medicine_name: it.medicine_name,
          batch_number: "", // Ready for manual entry or AI Challan scan
          expiry_date: "",
          trade_price: Number(it.estimated_trade_price ?? it.trade_price) || 0,
          ordered_qty: Number(it.final_order_qty_pcs ?? it.ordered_qty) || 1,
          bonus_qty: 0,
          discount_percent: 0,
        }));
        setDraftItems(mappedFromReq);
      }

      // Default godown destination
      const defaultWh =
        activeLocation?.id ||
        locations.find((l) => l.type === "warehouse")?.id ||
        locations[0]?.id ||
        "";
      setDraftWarehouseId(defaultWh);

      setCreateDialogOpen(true);

      if (showToast) {
        toast.info(`Hydrated from Requisition ${req.requisition_number || ""}`, {
          description:
            "Missing items? Click the trash icon to drop undelivered medicines, or click 'Scan Paper / PDF Memo' to auto-reconcile with the physical challan.",
        });
      }
    },
    [activeLocation?.id, locations]
  );

  // Handle incoming Requisition conversion & hydration from URL query (?from_requisition=:id) or history.state
  useEffect(() => {
    if (!pharmacyId) return;

    const searchParams = new URLSearchParams(location.search);
    const fromReqId = searchParams.get("from_requisition");

    // 1. Primary Path: Robust URL Query Param Hydration from Database (Page Reload Safe)
    if (fromReqId) {
      const fetchAndHydrateRequisition = async (reqId: string) => {
        try {
          const { data: req, error } = await supabase
            .from("requisitions" as any)
            .select(`
              id,
              requisition_number,
              supplier_id,
              notes,
              suppliers (id, name),
              requisition_items (
                id,
                medicine_id,
                medicine_name,
                final_order_qty_pcs,
                estimated_trade_price
              )
            `)
            .eq("id", reqId)
            .eq("pharmacy_id", pharmacyId)
            .maybeSingle();

          if (error) {
            console.warn("Failed to fetch requisition by ID:", error);
            return;
          }

          if (req) {
            hydrateFromRequisitionRecord(req, true);
          }
        } catch (fetchErr) {
          console.warn("Error hydrating requisition from URL:", fetchErr);
        }
      };

      fetchAndHydrateRequisition(fromReqId);
      return;
    }

    // 2. Secondary Path: React-Router memory state fallback
    const state = location.state as any;
    if (state?.fromRequisition) {
      hydrateFromRequisitionRecord(state, true);
      // Clean history state so reload doesn't keep volatile state
      window.history.replaceState({}, document.title);
    }
  }, [location.search, location.state, pharmacyId, hydrateFromRequisitionRecord]);

  // Fetch Pending Requisitions for In-PO Importer
  const handleOpenImportRequisitionModal = async () => {
    if (!pharmacyId) return;
    setImportReqDialogOpen(true);
    setLoadingPendingReqs(true);
    try {
      let reqQuery = supabase
        .from("requisitions" as any)
        .select(`
          id,
          requisition_number,
          supplier_id,
          status,
          total_estimated_amount,
          created_at,
          notes,
          suppliers (id, name, sr_name, sr_phone, sr_whatsapp),
          requisition_items (
            id,
            medicine_id,
            medicine_name,
            final_order_qty_pcs,
            estimated_trade_price,
            pack_mode
          )
        `)
        .eq("pharmacy_id", pharmacyId)
        .in("status", ["draft", "shared", "sr_confirmed"]);

      if (branchId) {
        reqQuery = reqQuery.or(`location_id.eq.${branchId},location_id.is.null`);
      }

      const { data, error } = await reqQuery.order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        setPendingRequisitions(data);
      } else {
        setPendingRequisitions([]);
      }
    } catch (err) {
      console.warn("Error loading pending requisitions for import:", err);
      setPendingRequisitions([]);
    } finally {
      setLoadingPendingReqs(false);
    }
  };

  const handleSelectRequisitionToImport = (req: any) => {
    hydrateFromRequisitionRecord(req, true);
    setImportReqDialogOpen(false);
  };

  // KPI Calculations
  const metrics = useMemo(() => {
    const totalPOs = purchaseOrders.length;
    const draftInvoices = purchaseOrders.filter((po) => po.status === "draft").length;
    const received = purchaseOrders.filter((po) => po.status === "received").length;
    const totalInvoicedValue = purchaseOrders.reduce(
      (sum, po) => sum + (Number(po.total_amount) || 0),
      0
    );

    return { totalPOs, draftInvoices, received, totalInvoicedValue };
  }, [purchaseOrders]);

  // Real-time Draft Invoice Calculations
  const invoiceCalculations = useMemo(() => {
    let grossTotal = 0;
    let itemDiscountsTotal = 0;
    let totalFreeUnits = 0;

    for (const it of draftItems) {
      const lineGross = (Number(it.trade_price) || 0) * (Number(it.ordered_qty) || 0);
      const lineDisc = lineGross * ((Number(it.discount_percent) || 0) / 100);
      grossTotal += lineGross;
      itemDiscountsTotal += lineDisc;
      totalFreeUnits += Number(it.bonus_qty) || 0;
    }

    const netBeforeInvoiceDiscount = Math.max(0, grossTotal - itemDiscountsTotal);
    const invoiceDiscount = Math.min(netBeforeInvoiceDiscount, Number(draftInvoiceDiscount) || 0);
    const vat = Number(draftVatAmount) || 0;
    const finalNetPayable = Math.max(0, netBeforeInvoiceDiscount - invoiceDiscount + vat);

    return {
      grossTotal,
      itemDiscountsTotal,
      invoiceDiscount,
      vat,
      finalNetPayable,
      totalFreeUnits,
    };
  }, [draftItems, draftInvoiceDiscount, draftVatAmount]);

  // Open Create PO Dialog with Smart Defaults
  const handleOpenCreatePO = () => {
    if (suppliers.length === 0) {
      toast.error("Please add at least one supplier before generating a Purchase Order", {
        action: {
          label: "Add Supplier",
          onClick: () => navigate("/procurement/suppliers"),
        },
      });
      return;
    }

    setDraftRequisitionId(null);
    setRequisitionOriginNumber(null);
    setDraftSupplierId(suppliers[0]?.id || "");
    const defaultWh =
      branchId ||
      activeLocation?.id ||
      warehouseLocations.find(
        (l) => l.type === "warehouse" || (l.type as string) === "godown"
      )?.id ||
      locations[0]?.id ||
      "";
    setDraftWarehouseId(defaultWh);
    setDraftInvoiceNumber(`PO-${Date.now().toString().slice(-6)}`);
    setDraftOrderDate(new Date().toISOString().split("T")[0]);
    setDraftExpectedDate("");
    setDraftInvoiceDiscount(0);
    setDraftVatAmount(0);
    setDraftNotes("");
    setFormErrors({});
    setIsScanMode(false);
    setIsScanning(false);
    setScanFileName("");
    const initialItemId = `item_${Date.now()}_1`;
    setDraftItems([
      {
        id: initialItemId,
        medicine_name: "Napa Extra 500mg Tablet",
        batch_number: "NE-2026-A1",
        expiry_date: "2027-12",
        trade_price: 2.5,
        ordered_qty: 100,
        bonus_qty: 10,
        discount_percent: 5,
      },
    ]);
    setExpandedItemId(initialItemId);
    setCreateDialogOpen(true);
  };

  // Convert File to Base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Helper to extract JSON from various AI response shapes
  const parseAIInvoiceJSON = (raw: any): any => {
    if (!raw) return null;
    if (typeof raw === "object" && (raw.items || raw.supplier_name)) {
      return raw;
    }
    const text = typeof raw === "string" ? raw : raw?.reply || raw?.text || JSON.stringify(raw);
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  };

  // Real Supabase Edge Function AI Invoice Scanner Integration
  const processInvoiceImage = async (file: File) => {
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      toast.error("File size exceeds 15MB limit. Please upload a smaller image.");
      return;
    }

    try {
      setIsScanning(true);
      setScanFileName(file.name);

      const base64Data = await fileToBase64(file);
      let parsedData: any = null;
      let lastErrorMessage = "";

      // 1. Try 'process-invoice' first (if deployed)
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await supabase.functions.invoke("process-invoice", {
          body: formData,
        });
        if (res.data && !res.error) {
          parsedData = parseAIInvoiceJSON(res.data);
        } else if (res.error) {
          lastErrorMessage = res.error.message || "";
        }
      } catch (err: any) {
        lastErrorMessage = err?.message || "";
      }

      // 1b. Fallback with JSON body for process-invoice
      if (!parsedData) {
        try {
          const res = await supabase.functions.invoke("process-invoice", {
            body: {
              imageBase64: base64Data,
              mimeType: file.type || "image/jpeg",
            },
          });
          if (res.data && !res.error) {
            parsedData = parseAIInvoiceJSON(res.data);
          } else if (res.error) {
            lastErrorMessage = res.error.message || lastErrorMessage;
          }
        } catch (err: any) {
          lastErrorMessage = err?.message || lastErrorMessage;
        }
      }

      // 2. Seamless Fallback: Invoke the verified deployed 'medinist-ai' Edge Function
      if (!parsedData) {
        try {
          const prompt = `You are an expert pharmacy invoice parser. Analyze this supplier invoice/challan image.
Extract the data and return ONLY a valid JSON object matching this schema without any markdown formatting or commentary:
{
  "supplier_name": "Supplier or pharmaceutical company name",
  "invoice_number": "Invoice/Challan/Memo Number",
  "invoice_date": "YYYY-MM-DD",
  "expected_date": "YYYY-MM-DD",
  "invoice_discount": 0,
  "vat_amount": 0,
  "notes": "Extracted via AI scanner",
  "items": [
    {
      "medicine_name": "Medicine brand name and dosage form (e.g. Napa Extra 500mg)",
      "batch_number": "Batch code (e.g. BTH-01)",
      "expiry_date": "YYYY-MM (e.g. 2027-12)",
      "trade_price": 2.50,
      "ordered_qty": 100,
      "bonus_qty": 0,
      "discount_percent": 0
    }
  ]
}`;
          const aiRes = await supabase.functions.invoke("medinist-ai", {
            body: {
              messages: [{ role: "user", content: prompt }],
              imageBase64: base64Data,
            },
          });

          if (aiRes.data && !aiRes.error) {
            parsedData = parseAIInvoiceJSON(aiRes.data.reply || aiRes.data);
          } else if (aiRes.error) {
            lastErrorMessage = aiRes.error.message || lastErrorMessage;
          }
        } catch (aiErr: any) {
          lastErrorMessage = aiErr?.message || lastErrorMessage;
        }
      }

      // 3. If an edge function returned structured data, hydrate the form!
      if (parsedData) {
        // Match Supplier
        if (parsedData.supplier_name && suppliers.length > 0) {
          const query = String(parsedData.supplier_name).toLowerCase().trim();
          const matched = suppliers.find((s) => {
            const sName = s.name.toLowerCase().trim();
            return sName.includes(query) || query.includes(sName);
          });
          if (matched) {
            setDraftSupplierId(matched.id);
          }
        }

        // Hydrate Header Fields
        if (parsedData.invoice_number) {
          setDraftInvoiceNumber(String(parsedData.invoice_number).trim());
        }
        if (parsedData.invoice_date) {
          setDraftOrderDate(parsedData.invoice_date);
        }
        if (parsedData.expected_date) {
          setDraftExpectedDate(parsedData.expected_date);
        }
        if (typeof parsedData.invoice_discount === "number") {
          setDraftInvoiceDiscount(Math.max(0, parsedData.invoice_discount));
        }
        if (typeof parsedData.vat_amount === "number") {
          setDraftVatAmount(Math.max(0, parsedData.vat_amount));
        }
        if (parsedData.notes) {
          setDraftNotes(parsedData.notes);
        }

        // Hydrate Line Items & Catalog Links
        if (Array.isArray(parsedData.items) && parsedData.items.length > 0) {
          const defaultExpiry = new Date(Date.now() + 730 * 24 * 3600 * 1000)
            .toISOString()
            .slice(0, 7);

          // AI Reconciler Mode: Cross-reference with existing Requisition items
          if (draftRequisitionId && draftItems.length > 0) {
            const matchedRequisitionItemIds = new Set<string>();
            const reconciledItems: DraftPOItem[] = [];

            for (let idx = 0; idx < parsedData.items.length; idx++) {
              const aiItem = parsedData.items[idx];
              const aiMedName = String(aiItem.medicine_name || "").trim().toLowerCase();

              // Fuzzy match against existing requisition items
              const matchedDraftItem = draftItems.find((d) => {
                if (matchedRequisitionItemIds.has(d.id)) return false;
                const dName = d.medicine_name.toLowerCase();
                const dFirstWord = dName.split(" ")[0];
                return (
                  dName.includes(aiMedName) ||
                  aiMedName.includes(dName) ||
                  (dFirstWord && dFirstWord.length >= 3 && aiMedName.startsWith(dFirstWord))
                );
              });

              if (matchedDraftItem) {
                matchedRequisitionItemIds.add(matchedDraftItem.id);
                reconciledItems.push({
                  ...matchedDraftItem,
                  batch_number: aiItem.batch_number ? String(aiItem.batch_number).trim() : `BTH-${Date.now().toString().slice(-4)}`,
                  expiry_date: aiItem.expiry_date ? String(aiItem.expiry_date).trim() : defaultExpiry,
                  trade_price: typeof aiItem.trade_price === "number" && aiItem.trade_price > 0 ? aiItem.trade_price : matchedDraftItem.trade_price,
                  ordered_qty: typeof aiItem.ordered_qty === "number" && aiItem.ordered_qty > 0 ? aiItem.ordered_qty : matchedDraftItem.ordered_qty,
                  bonus_qty: typeof aiItem.bonus_qty === "number" ? aiItem.bonus_qty : 0,
                  discount_percent: typeof aiItem.discount_percent === "number" ? aiItem.discount_percent : 0,
                });
              } else {
                // Extra item on physical invoice not in original requisition
                const catalogMatch = catalogOptions.find(
                  (m) => m.name.toLowerCase() === aiMedName
                );
                reconciledItems.push({
                  id: `scanned_extra_${Date.now()}_${idx + 1}`,
                  medicine_id: catalogMatch?.id,
                  medicine_name: aiItem.medicine_name || `Delivered Item #${idx + 1}`,
                  batch_number: aiItem.batch_number ? String(aiItem.batch_number).trim() : `BTH-${Date.now().toString().slice(-4)}`,
                  expiry_date: aiItem.expiry_date ? String(aiItem.expiry_date).trim() : defaultExpiry,
                  trade_price: Math.max(0, Number(aiItem.trade_price) || 0),
                  ordered_qty: Math.max(1, parseInt(aiItem.ordered_qty) || 1),
                  bonus_qty: Math.max(0, parseInt(aiItem.bonus_qty) || 0),
                  discount_percent: Math.max(0, parseFloat(aiItem.discount_percent) || 0),
                });
              }
            }

            const undeliveredCount = draftItems.length - matchedRequisitionItemIds.size;
            setDraftItems(reconciledItems);

            toast.success("AI Reconciled with Requisition!", {
              description: `Matched ${matchedRequisitionItemIds.size} items with Batch & Trade Price.${
                undeliveredCount > 0
                  ? ` Dropped ${undeliveredCount} undelivered item${undeliveredCount > 1 ? "s" : ""}.`
                  : ""
              }`,
            });
          } else {
            // Standard scan mode
            const mappedItems: DraftPOItem[] = parsedData.items.map((it: any, idx: number) => {
              const medName = String(it.medicine_name || "").trim() || `Medicine #${idx + 1}`;
              const catalogMatch = catalogOptions.find(
                (m) => m.name.toLowerCase() === medName.toLowerCase()
              );

              return {
                id: `scanned_${Date.now()}_${idx + 1}`,
                medicine_id: catalogMatch?.id,
                medicine_name: medName,
                batch_number: it.batch_number ? String(it.batch_number).trim() : `BTH-${Date.now().toString().slice(-4)}`,
                expiry_date: it.expiry_date ? String(it.expiry_date).trim() : defaultExpiry,
                trade_price: Math.max(0, Number(it.trade_price) || 0),
                ordered_qty: Math.max(1, parseInt(it.ordered_qty) || 1),
                bonus_qty: Math.max(0, parseInt(it.bonus_qty) || 0),
                discount_percent: Math.max(0, parseFloat(it.discount_percent) || 0),
              };
            });

            setDraftItems(mappedItems);
            toast.success("Invoice scanned successfully!", {
              description: `Extracted ${mappedItems.length} items with batch & trade pricing.`,
            });
          }
        } else {
          toast.info("Invoice parsed, but no individual medicine rows were detected. Please verify details.");
        }

        setIsScanMode(false);
        setFormErrors({});
      } else {
        // Graceful Client-side Fallback without throwing uncaught errors
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 20);
        setDraftInvoiceNumber(`INV-${cleanName}`);
        setDraftNotes(`Scanned document: ${file.name}`);
        setIsScanMode(false);

        toast.info("AI Edge Function returned a non-2xx status code. Initialized form for manual entry.", {
          description: `Invoice reference created from "${file.name}". You can now fill and receive stock.`,
        });
      }
    } catch (err: any) {
      console.warn("[PurchaseOrders] Non-fatal invoice scan fallback:", err);
      setIsScanMode(false);
      toast.info("AI Scanner could not complete. You can enter invoice details manually.");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAddDraftItem = () => {
    const newItemId = `item_${Date.now()}_${draftItems.length + 1}`;
    const newItem: DraftPOItem = {
      id: newItemId,
      medicine_name: "",
      batch_number: "",
      expiry_date: "",
      trade_price: 10,
      ordered_qty: 50,
      bonus_qty: 0,
      discount_percent: 0,
    };

    // 1. Prepend to top so workstation stays directly visible under button
    setDraftItems((prev) => [newItem, ...prev]);

    // 2. Expand only this newly created item
    setExpandedItemId(newItemId);

    // 3. Auto-focus on the new item's medicine input
    setTimeout(() => {
      medicineInputRefs.current[newItemId]?.focus();
    }, 60);
  };

  const handleRemoveDraftItem = (id: string) => {
    if (draftItems.length === 1) {
      toast.error("An invoice must contain at least one line item");
      return;
    }
    setDraftItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      if (expandedItemId === id) {
        setExpandedItemId(next[0]?.id || null);
      }
      return next;
    });
    delete medicineInputRefs.current[id];
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleItemChange = (id: string, field: keyof DraftPOItem, value: any) => {
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
    if (formErrors[id]) {
      setFormErrors((prev) => {
        const current = { ...prev[id] };
        if (field === "batch_number" && value && String(value).trim()) {
          delete current.batch;
        }
        if (field === "expiry_date" && value && String(value).trim()) {
          delete current.expiry;
        }
        if (!current.batch && !current.expiry) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: current };
      });
    }
  };

  // Expiry Month Picker Handlers
  const handleOpenExpiryPicker = (itemId: string, currentVal?: string) => {
    setExpiryPickerItemId(itemId);
    if (currentVal && currentVal.trim()) {
      const val = currentVal.trim();
      if (val.includes("-")) {
        const parts = val.split("-");
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && y >= 2020 && y <= 2099) setExpiryPickerYear(y);
        else setExpiryPickerYear(new Date().getFullYear());
        if (!isNaN(m) && m >= 0 && m < 12) setExpiryPickerMonth(m);
        else setExpiryPickerMonth(new Date().getMonth());
      } else if (val.includes("/")) {
        const parts = val.split("/");
        let m = parseInt(parts[0], 10) - 1;
        let y = parseInt(parts[1], 10);
        if (parts[0].length === 4) {
          y = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10) - 1;
        }
        if (!isNaN(y) && y >= 2020 && y <= 2099) setExpiryPickerYear(y);
        else setExpiryPickerYear(new Date().getFullYear());
        if (!isNaN(m) && m >= 0 && m < 12) setExpiryPickerMonth(m);
        else setExpiryPickerMonth(new Date().getMonth());
      } else {
        setExpiryPickerYear(new Date().getFullYear());
        setExpiryPickerMonth(new Date().getMonth());
      }
    } else {
      setExpiryPickerYear(new Date().getFullYear());
      setExpiryPickerMonth(new Date().getMonth());
    }
    setExpiryPickerOpen(true);
  };

  const handleConfirmExpiryPicker = () => {
    if (expiryPickerItemId) {
      const formattedMonth = String(expiryPickerMonth + 1).padStart(2, "0");
      const formatted = `${expiryPickerYear}-${formattedMonth}`;
      handleItemChange(expiryPickerItemId, "expiry_date", formatted);
    }
    setExpiryPickerOpen(false);
    setExpiryPickerItemId(null);
  };

  const handleClearExpiryPicker = () => {
    if (expiryPickerItemId) {
      handleItemChange(expiryPickerItemId, "expiry_date", "");
    }
    setExpiryPickerOpen(false);
    setExpiryPickerItemId(null);
  };

  const handleSelectCatalogMedicine = (id: string, name: string) => {
    const catalogMatch = catalogOptions.find(
      (m) => m.name.toLowerCase() === name.toLowerCase()
    );
    setDraftItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const estimatedTP = catalogMatch?.price
          ? Math.round(Number(catalogMatch.price) * 0.88 * 100) / 100
          : it.trade_price;
        return {
          ...it,
          medicine_id: catalogMatch?.id,
          medicine_name: name,
          trade_price: estimatedTP || it.trade_price,
        };
      })
    );
  };

  // Save Purchase Order / Invoice (Draft or Direct Received)
  const handleSavePurchaseOrder = async (targetStatus: "draft" | "received") => {
    if (!pharmacyId) return;

    if (!draftSupplierId) {
      toast.error("Please select a pharmaceutical vendor / supplier");
      return;
    }

    const invalidItem = draftItems.find(
      (it) => !it.medicine_name.trim() || Number(it.ordered_qty) <= 0
    );
    if (invalidItem) {
      setExpandedItemId(invalidItem.id);
      setTimeout(() => {
        medicineInputRefs.current[invalidItem.id]?.focus();
      }, 60);
      toast.error("All medicine line items must have a valid name and quantity");
      return;
    }

    // Step 2: Batch # and Expiry Date are now OPTIONAL (can be left blank and saved)
    setFormErrors({});

    try {
      setIsSubmitting(true);
      const supplierObj = suppliers.find((s) => s.id === draftSupplierId);

      const itemsPayload: Partial<PurchaseOrderItemRecord>[] = draftItems.map((it) => {
        const lineGross = (Number(it.trade_price) || 0) * (Number(it.ordered_qty) || 0);
        const lineNet = lineGross * (1 - (Number(it.discount_percent) || 0) / 100);
        const physicalUnits = (Number(it.ordered_qty) || 1) + (Number(it.bonus_qty) || 0);
        return {
          medicine_id: it.medicine_id || null,
          medicine_name: it.medicine_name.trim(),
          order_quantity: Number(it.ordered_qty) || 1,
          received_qty: targetStatus === "received" ? physicalUnits : 0,
          unit_cost: Number(it.trade_price) || 0,
          total_cost: Math.round(lineNet * 100) / 100,
          batch_number: it.batch_number ? it.batch_number.trim() : null,
          expiry_date: formatExpiryForDb(it.expiry_date),
        };
      });

      const finalNetPayable = Math.round(invoiceCalculations.finalNetPayable * 100) / 100;

      const poPayload: Partial<PurchaseOrderRecord> = {
        pharmacy_id: pharmacyId,
        supplier_id: draftSupplierId,
        warehouse_id: draftWarehouseId || branchId || activeLocation?.id || null,
        po_number: draftInvoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
        status: targetStatus,
        total_amount: finalNetPayable,
        order_date: draftOrderDate,
        expected_date: draftExpectedDate || null,
        received_at: targetStatus === "received" ? new Date().toISOString() : null,
        received_by: targetStatus === "received" ? (profile?.id || null) : null,
        notes: draftNotes.trim()
          ? `${draftNotes.trim()} | Billed: ৳${invoiceCalculations.grossTotal.toFixed(2)}, Disc: ৳${(
              invoiceCalculations.itemDiscountsTotal + invoiceCalculations.invoiceDiscount
            ).toFixed(2)}, Free Units: ${invoiceCalculations.totalFreeUnits}`
          : `Billed: ৳${invoiceCalculations.grossTotal.toFixed(2)}, Disc: ৳${(
              invoiceCalculations.itemDiscountsTotal + invoiceCalculations.invoiceDiscount
            ).toFixed(2)}, Free Units: ${invoiceCalculations.totalFreeUnits}`,
        supplier: supplierObj,
      };

      // 1. Save Purchase Order Record & Items
      const savedPo = await warehouseStorage.savePurchaseOrder(pharmacyId, poPayload, itemsPayload);

      // 2. Direct GRN Execution (Inventory Ingestion & Supplier Ledger Bill Entry)
      if (targetStatus === "received") {
        const targetWarehouse = draftWarehouseId || branchId || activeLocation?.id || null;

        // Ingest physical stock into medicines table
        for (const item of draftItems) {
          const totalUnits = (Number(item.ordered_qty) || 0) + (Number(item.bonus_qty) || 0);
          if (totalUnits <= 0) continue;

          let medQuery = supabase
            .from("medicines")
            .select("id, stock_quantity")
            .eq("pharmacy_id", pharmacyId);

          if (item.medicine_id) {
            medQuery = medQuery.eq("id", item.medicine_id);
          } else {
            medQuery = medQuery.ilike("name", item.medicine_name.trim());
            if (targetWarehouse) {
              medQuery = medQuery.eq("location_id", targetWarehouse);
            }
          }

          const { data: existingMed } = await medQuery.maybeSingle();

          if (existingMed) {
            const newQty = (Number(existingMed.stock_quantity) || 0) + totalUnits;
            const updateMedPayload: any = {
              stock_quantity: newQty,
              updated_at: new Date().toISOString(),
            };
            if (item.batch_number && item.batch_number.trim()) {
              updateMedPayload.batch_number = item.batch_number.trim();
            }
            if (item.expiry_date && item.expiry_date.trim()) {
              updateMedPayload.expiry_date = formatExpiryForDb(item.expiry_date);
            }
            if (item.trade_price) {
              updateMedPayload.purchase_price_unit = Number(item.trade_price);
            }
            await supabase
              .from("medicines")
              .update(updateMedPayload)
              .eq("id", existingMed.id);
          } else {
            await supabase.from("medicines").insert({
              pharmacy_id: pharmacyId,
              location_id: targetWarehouse || null,
              name: item.medicine_name.trim(),
              stock_quantity: totalUnits,
              purchase_price_unit: Number(item.trade_price) || 0,
              price: item.trade_price ? Math.round(Number(item.trade_price) * 1.15 * 100) / 100 : 20,
              batch_number: item.batch_number ? item.batch_number.trim() : null,
              expiry_date: formatExpiryForDb(item.expiry_date),
              is_active: true,
            });
          }
        }

        // Post financial liability to supplier ledger
        await warehouseStorage.recordSupplierLedgerEntry(pharmacyId, draftSupplierId, {
          transaction_type: "bill",
          amount: finalNetPayable,
          description: `Direct Supplier Invoice: ${poPayload.po_number}`,
          purchase_order_id: savedPo?.id,
        });

        // If originating from a specific Requisition, close that requisition
        if (draftRequisitionId && savedPo?.id) {
          try {
            await (supabase.from("requisitions" as any) as any)
              .update({
                status: "converted_to_po",
                converted_po_id: savedPo.id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", draftRequisitionId);
          } catch (rErr) {
            console.warn("Could not link requisition to PO:", rErr);
          }
        }

        // Automatic Supply Chain Reconciliation:
        // Also auto-mark all open/draft/shared requisitions for this vendor created within the last 7 days
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          await (supabase.from("requisitions" as any) as any)
            .update({
              status: "converted_to_po",
              converted_po_id: savedPo?.id || null,
              updated_at: new Date().toISOString(),
            })
            .eq("pharmacy_id", pharmacyId)
            .eq("supplier_id", draftSupplierId)
            .in("status", ["draft", "shared", "sr_confirmed"])
            .gte("created_at", sevenDaysAgo);
        } catch (autoSyncErr) {
          console.warn("Auto-reconcile open requisitions for supplier notice:", autoSyncErr);
        }

        toast.success(
          `Stock Received & Invoice Saved! Physical inventory updated & ৳${finalNetPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} credited to ${
            supplierObj?.name || "Supplier"
          }'s ledger.`
        );
      } else {
        // Saved as Draft: also link requisition if present
        if (draftRequisitionId && savedPo?.id) {
          try {
            await (supabase.from("requisitions" as any) as any)
              .update({
                converted_po_id: savedPo.id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", draftRequisitionId);
          } catch (rErr) {
            console.warn("Could not link requisition to PO:", rErr);
          }
        }

        toast.success(`Draft invoice saved for ${supplierObj?.name}`);
      }

      setCreateDialogOpen(false);
      setDraftRequisitionId(null);
      setRequisitionOriginNumber(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save Purchase Order");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open GRN Receiving Dialog
  const handleOpenGRNModal = (po: PurchaseOrder) => {
    setSelectedPO(po);
    const rows: GRNItemRow[] = (po.items || []).map((it) => ({
      item_id: it.id,
      medicine_id: it.medicine_id || null,
      medicine_name: it.medicine_name,
      ordered_qty: it.ordered_qty,
      bonus_qty: 0,
      received_qty: it.ordered_qty,
      trade_price: it.unit_cost,
      batch_number: it.batch_number || `BTH-${Date.now().toString().slice(-4)}`,
      expiry_date: it.expiry_date || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split("T")[0],
    }));
    setGrnItems(rows);
    setGrnDialogOpen(true);
  };

  // Confirm Physical Receiving via GRN
  const handleConfirmGRN = async () => {
    if (!selectedPO || !pharmacyId) return;

    try {
      setIsSubmitting(true);
      const targetWarehouse = selectedPO.warehouse_id;

      // 1. Credit Inventory (Increment stock quantity and register batches)
      for (const item of grnItems) {
        const qtyReceived = Number(item.received_qty) || 0;
        if (qtyReceived <= 0) continue;

        let medQuery = supabase
          .from("medicines")
          .select("id, stock_quantity")
          .eq("pharmacy_id", pharmacyId);

        if (item.medicine_id) {
          medQuery = medQuery.eq("id", item.medicine_id);
        } else {
          medQuery = medQuery.ilike("name", item.medicine_name);
          if (targetWarehouse) {
            medQuery = medQuery.eq("location_id", targetWarehouse);
          }
        }

        const { data: existingMed } = await medQuery.maybeSingle();

        if (existingMed) {
          const newQty = (Number(existingMed.stock_quantity) || 0) + qtyReceived;
          await supabase
            .from("medicines")
            .update({
              stock_quantity: newQty,
              expiry_date: formatExpiryForDb(item.expiry_date) || undefined,
            })
            .eq("id", existingMed.id);
        } else {
          await supabase.from("medicines").insert({
            pharmacy_id: pharmacyId,
            location_id: targetWarehouse || null,
            name: item.medicine_name,
            stock_quantity: qtyReceived,
            price: item.trade_price ? Math.round(item.trade_price * 1.15 * 100) / 100 : 20,
            expiry_date: formatExpiryForDb(item.expiry_date),
          });
        }
      }

      // 2. Post Financial Liability to Supplier Ledger (Credit = Bill)
      const finalAmount = Number(selectedPO.total_amount) || 0;
      await warehouseStorage.recordSupplierLedgerEntry(pharmacyId, selectedPO.supplier_id, {
        transaction_type: "bill",
        amount: finalAmount,
        description: `Goods Received Note (GRN): Purchase Invoice ${selectedPO.po_number}`,
        purchase_order_id: selectedPO.id,
      });

      // 3. Mark PO as 'received'
      await warehouseStorage.updatePurchaseOrderStatus(
        pharmacyId,
        selectedPO.id,
        "received",
        {
          received_at: new Date().toISOString(),
          received_by: profile?.id || null,
        }
      );

      // 4. Automatic Supply Chain Reconciliation:
      // Auto-mark any open requisitions for this vendor created within the last 7 days as converted
      if (selectedPO.supplier_id) {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          await (supabase.from("requisitions" as any) as any)
            .update({
              status: "converted_to_po",
              converted_po_id: selectedPO.id,
              updated_at: new Date().toISOString(),
            })
            .eq("pharmacy_id", pharmacyId)
            .eq("supplier_id", selectedPO.supplier_id)
            .in("status", ["draft", "shared", "sr_confirmed"])
            .gte("created_at", sevenDaysAgo);
        } catch (autoSyncErr) {
          console.warn("Auto-reconcile open requisitions in GRN notice:", autoSyncErr);
        }
      }

      toast.success(
        `GRN Confirmed! Physical stock ingested & ৳${finalAmount.toLocaleString("en-IN")} credited to ${
          selectedPO.supplier?.name || "Supplier"
        }'s ledger.`
      );

      setGrnDialogOpen(false);
      setSelectedPO(null);
      fetchData();
    } catch (err: any) {
      console.error("GRN execution error:", err);
      toast.error(err.message || "Failed to process Goods Received Note");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit / Resume Draft Invoice in Form Modal
  const handleResumeDraft = (po: PurchaseOrder) => {
    setDraftSupplierId(po.supplier_id || "");
    setDraftWarehouseId(po.warehouse_id || "");
    setDraftInvoiceNumber(po.po_number || "");
    setDraftOrderDate(po.order_date || new Date().toISOString().split("T")[0]);
    setDraftExpectedDate(po.expected_date || "");
    setDraftNotes(po.notes || "");
    setFormErrors({});
    if (po.items && po.items.length > 0) {
      setDraftItems(
        po.items.map((it, idx) => ({
          id: it.id || `item_${idx}_${Date.now()}`,
          medicine_id: it.medicine_id || undefined,
          medicine_name: it.medicine_name,
          batch_number: it.batch_number || "",
          expiry_date: it.expiry_date || "",
          trade_price: Number(it.unit_cost) || 0,
          ordered_qty: Number(it.ordered_qty) || 1,
          bonus_qty: 0,
          discount_percent: 0,
        }))
      );
    }
    setCreateDialogOpen(true);
  };

  // Cancel PO
  const handleCancelPO = async (poId: string, poNum: string) => {
    const confirmCancel = window.confirm(`Are you sure you want to cancel ${poNum}?`);
    if (!confirmCancel) return;

    try {
      await warehouseStorage.updatePurchaseOrderStatus(pharmacyId!, poId, "cancelled");
      toast.success(`Purchase order ${poNum} cancelled`);
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to cancel PO");
    }
  };

  // Filtered Purchase Orders
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (activeTab !== "all" && po.status !== activeTab) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchNum = po.po_number?.toLowerCase().includes(q);
      const matchSupplier = po.supplier?.name?.toLowerCase().includes(q);
      const matchItem = po.items?.some((it) => it.medicine_name.toLowerCase().includes(q));
      return matchNum || matchSupplier || matchItem;
    });
  }, [purchaseOrders, activeTab, searchQuery]);

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 gap-1 font-medium text-[11px]">
            <Clock className="h-3 w-3" /> Draft
          </Badge>
        );
      case "ordered":
        return (
          <Badge className="bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold gap-1 text-[11px] shadow-none">
            <Truck className="h-3 w-3" /> Inbound / Awaiting GRN
          </Badge>
        );
      case "received":
        return (
          <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold gap-1 text-[11px] shadow-none">
            <CheckCircle2 className="h-3 w-3" /> Received (GRN Ingested)
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1 text-[11px]">
            <XCircle className="h-3 w-3" /> Cancelled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getWarehouseName = (whId?: string | null) => {
    if (!whId) return "Central Godown";
    const loc = locations.find((l) => l.id === whId);
    return loc ? loc.name : "Warehouse";
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-5xl mx-auto px-4 py-5 pb-24">
      {/* Header & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Purchase Orders (Inwards)
            </h1>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
              <Building2 className="h-3 w-3 text-slate-500" />
              {branchName || activeLocation?.name || "Active Branch"}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Vendor procurement pipeline, trade-price verification, and GRN inventory receiving
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenImportRequisitionModal}
            className="rounded-xl border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 h-9 px-3 gap-1.5 text-xs font-semibold"
            title="Import active or confirmed Requisitions directly into an invoice"
          >
            <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
            <span>Import Pending Requisition</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/procurement/smart-requisitions")}
            className="rounded-xl border-purple-200 text-purple-700 bg-purple-50/50 hover:bg-purple-100 hover:text-purple-800 h-9 px-3 gap-1.5 text-xs font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-600" />
            <span>Smart Order Planner</span>
          </Button>

          <Button
            size="sm"
            onClick={handleOpenCreatePO}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs h-9 px-4 gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>Add Supplier Invoice</span>
          </Button>
        </div>
      </div>

      {/* Symmetrical 4-Card KPI Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* KPI 1: Total Orders */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Total Invoices
            </span>
            <span className="text-lg font-bold text-gray-900 mt-1 block tracking-tight">
              {metrics.totalPOs}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4" />
          </div>
        </div>

        {/* KPI 2: Draft Invoices */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Draft Invoices
            </span>
            <span className="text-lg font-bold text-amber-600 mt-1 block tracking-tight">
              {metrics.draftInvoices}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        {/* KPI 3: Received via GRN */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Received (GRN)
            </span>
            <span className="text-lg font-bold text-emerald-600 mt-1 block tracking-tight">
              {metrics.received}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>

        {/* KPI 4: Total Invoiced Value */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Total Invoiced
            </span>
            <span className="text-lg font-bold text-purple-700 mt-1 block tracking-tight truncate">
              ৳ {metrics.totalInvoicedValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Receipt className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
        {(["all", "draft", "received", "cancelled"] as const).map((tab) => {
          const count = purchaseOrders.filter((po) => tab === "all" || po.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === tab
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80"
              }`}
            >
              <span>
                {tab === "all" ? "All Invoices" : tab === "draft" ? "Drafts" : tab === "received" ? "Received" : "Cancelled"}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === tab ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by invoice number, supplier name, or medicine..."
          className="pl-9 h-9 text-xs bg-white rounded-xl border-gray-200 shadow-xs focus-visible:ring-blue-600"
        />
      </div>

      {/* PO / Invoices List */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="animate-spin h-7 w-7 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-2.5" />
          <p className="text-xs text-slate-500">Loading purchase invoices...</p>
        </div>
      ) : filteredPOs.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-gray-100 shadow-xs text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            {searchQuery ? "No purchase orders match your search" : "No purchase orders recorded yet"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {searchQuery
              ? "Try adjusting your search criteria."
              : "Create a draft invoice with trade prices, bonuses, and discounts, then confirm receiving via GRN."}
          </p>
          {!searchQuery && (
            <Button
              onClick={handleOpenCreatePO}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs h-8 px-3"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Create First Purchase Order
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPOs.map((po) => (
            <div
              key={po.id}
              className="bg-white rounded-xl border border-gray-100 shadow-xs hover:border-gray-200 transition-all p-3.5 flex flex-col justify-between"
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{po.po_number}</span>
                      {getStatusBadge(po.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Created on{" "}
                      {new Date(po.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Net Payable:</span>
                  <span className="text-sm font-bold text-slate-900 tracking-tight">
                    ৳ {Number(po.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Metadata strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-2 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 truncate">
                  <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="truncate font-medium text-slate-800">
                    Vendor: {po.supplier?.name || "Manufacturer Depot"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <Warehouse className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">Godown: {getWarehouseName(po.warehouse_id)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate text-slate-500">
                    {po.status === "received"
                      ? `Received: ${
                          po.received_at
                            ? new Date(po.received_at).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                              })
                            : "Yes"
                        }`
                      : `Expected: ${po.expected_delivery_date || "Open Delivery"}`}
                  </span>
                </div>
              </div>

              {/* Line Items Preview Strip */}
              {po.items && po.items.length > 0 && (
                <div className="bg-slate-50/70 rounded-lg p-2.5 border border-slate-100 my-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Procured Items ({po.items.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {po.items.map((it) => (
                      <span
                        key={it.id}
                        className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-white border border-slate-200/80 text-slate-700"
                      >
                        <span className="font-semibold text-slate-900">{it.medicine_name}</span>
                        <span className="ml-1.5 text-blue-600 font-semibold font-mono">({it.ordered_qty})</span>
                        {it.received_qty > 0 && (
                          <span className="ml-1 text-emerald-600 font-medium">({it.received_qty} rec.)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-gray-100">
                <div className="min-w-0 flex-1 text-[11px] text-slate-500 font-medium leading-relaxed">
                  {po.notes || "Standard procurement cycle"}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  {po.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleResumeDraft(po)}
                        className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs gap-1.5 font-semibold shadow-xs"
                      >
                        <FileText className="h-3.5 w-3.5" /> Resume Draft
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelPO(po.id, po.po_number)}
                        className="h-8 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs"
                        title="Delete Draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}

                  {po.status === "ordered" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleResumeDraft(po)}
                        className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs gap-1.5 font-semibold shadow-xs"
                      >
                        <FileText className="h-3.5 w-3.5" /> Review & Receive
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelPO(po.id, po.po_number)}
                        className="h-8 px-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg text-xs"
                      >
                        Cancel
                      </Button>
                    </>
                  )}

                  {po.status === "received" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPO(po);
                        setDetailsDialogOpen(true);
                      }}
                      className="h-8 px-2.5 rounded-lg border-slate-200 text-slate-700 text-xs gap-1 font-medium bg-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View Invoice</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 1. DRAFT INVOICE / PURCHASE ORDER MODAL */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-3xl lg:max-w-4xl min-w-0 rounded-2xl p-3.5 sm:p-6 max-h-[92vh] overflow-y-auto overflow-x-hidden box-border">
          <DialogHeader className="w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full min-w-0">
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 min-w-0">
                <ClipboardList className="h-5 w-5 text-blue-600 shrink-0" />
                <span className="truncate">Supplier Invoice & Stock Ingestion</span>
              </DialogTitle>
              {!isScanMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsScanMode(true)}
                  className="h-8 px-2.5 rounded-xl border-purple-200 text-purple-700 bg-purple-50/70 hover:bg-purple-100 text-xs font-semibold gap-1.5 self-start sm:self-auto shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                  <span>Scan Paper / PDF Memo</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 w-full min-w-0 max-w-full overflow-hidden">
            {/* AI Scan Dropzone & Processing UI */}
            {isScanMode && (
              <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-blue-50/80 border-2 border-dashed border-indigo-300 rounded-2xl p-5 text-center transition-all">
                {isScanning ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-3">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 flex items-center justify-center animate-pulse">
                        <Sparkles className="h-7 w-7 text-indigo-600 animate-spin" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-ping" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">
                        Gemini AI is analyzing the invoice...
                      </p>
                      <p className="text-xs text-slate-500 max-w-md">
                        Extracting vendor, line items, trade pricing, batch numbers, and expiry dates from{" "}
                        <span className="font-semibold text-indigo-700">{scanFileName || "your invoice"}</span>.
                      </p>
                    </div>
                    <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 animate-pulse w-3/4" />
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        processInvoiceImage(e.dataTransfer.files[0]);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 mx-auto flex items-center justify-center shadow-xs">
                      <FileUp className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Upload or Drag & Drop Supplier Invoice / Challan
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supports photo, screenshot, or scan (PNG, JPG, JPEG, WEBP, PDF up to 15MB)
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-3 pt-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            processInvoiceImage(e.target.files[0]);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-4 h-9 shadow-xs gap-1.5"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Browse File</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsScanMode(false)}
                        className="text-slate-500 hover:text-slate-700 text-xs h-9"
                      >
                        Enter Manually
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Row 1: Vendor / Supplier (Full width for long vendor names) */}
            <div className="w-full min-w-0">
              <Label className="text-xs font-semibold text-slate-700">Vendor / Supplier *</Label>
              <Select value={draftSupplierId} onValueChange={setDraftSupplierId}>
                <SelectTrigger className="mt-1 h-9 rounded-lg text-xs bg-white w-full min-w-0">
                  <SelectValue placeholder="Select manufacturer/supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.payment_terms ? s.payment_terms.replace("_", " ") : "Net 30"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Receiving Godown & Challan/PO Number (2 Columns) */}
            <div className="grid grid-cols-2 gap-2.5 w-full min-w-0">
              <div className="w-full min-w-0">
                <Label className="text-xs font-semibold text-slate-700 truncate block">Receiving Godown *</Label>
                <Select value={draftWarehouseId} onValueChange={setDraftWarehouseId}>
                  <SelectTrigger className="mt-1 h-9 rounded-lg text-xs bg-white w-full min-w-0">
                    <SelectValue placeholder="Select godown" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} ({loc.type || "godown"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full min-w-0">
                <Label className="text-xs font-semibold text-slate-700 truncate block">Challan / PO # *</Label>
                <Input
                  value={draftInvoiceNumber}
                  onChange={(e) => setDraftInvoiceNumber(e.target.value)}
                  className="mt-1 h-9 rounded-lg text-xs font-mono font-medium w-full min-w-0"
                  placeholder="e.g. PO-8921"
                />
              </div>
            </div>

            {/* Row 3: Order Date & Expected Delivery Date (2 Columns) */}
            <div className="grid grid-cols-2 gap-2.5 w-full min-w-0">
              <div className="w-full min-w-0">
                <Label className="text-xs font-semibold text-slate-700 truncate block">Order Date</Label>
                <Input
                  type="date"
                  value={draftOrderDate}
                  onChange={(e) => setDraftOrderDate(e.target.value)}
                  className="mt-1 h-9 rounded-lg text-xs w-full min-w-0"
                />
              </div>
              <div className="w-full min-w-0">
                <Label className="text-xs font-semibold text-slate-700 truncate block">Expected Delivery</Label>
                <Input
                  type="date"
                  value={draftExpectedDate}
                  onChange={(e) => setDraftExpectedDate(e.target.value)}
                  className="mt-1 h-9 rounded-lg text-xs w-full min-w-0"
                />
              </div>
            </div>

            {/* Medicine Line-Items Section */}
            <div className="pt-2 w-full min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2 w-full min-w-0">
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider block truncate">
                    Medicine Line Items & Pricing
                  </Label>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    Batch # & Expiry are optional (can be filled or updated anytime).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddDraftItem}
                  className="h-8 px-2.5 rounded-lg text-xs gap-1 border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" /> <span>Add Medicine</span>
                </Button>
              </div>

              {/* Responsive Line Items Container */}
              <div className="w-full min-w-0 space-y-3">
                {draftItems.map((item, idx) => {
                  const lineGross = (Number(item.trade_price) || 0) * (Number(item.ordered_qty) || 0);
                  const lineNet = lineGross * (1 - (Number(item.discount_percent) || 0) / 100);
                  const itemIndex = draftItems.length - idx;

                  // A. Collapsed Row (~48px height) for inactive items
                  if (expandedItemId !== item.id) {
                    return (
                      <div
                        key={item.id}
                        onClick={() => setExpandedItemId(item.id)}
                        className="group flex items-center justify-between p-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl cursor-pointer transition shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                            #{itemIndex}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 truncate max-w-[150px] sm:max-w-[220px]">
                            {item.medicine_name.trim() || <span className="italic text-slate-400">Unnamed Item</span>}
                          </span>
                          {item.batch_number && (
                            <span className="hidden sm:inline-block text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono truncate max-w-[90px]">
                              {item.batch_number}
                            </span>
                          )}
                          {item.expiry_date && (
                            <span className="hidden md:inline-block text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                              Exp: {item.expiry_date}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-slate-600">
                            <strong className="text-slate-800">{item.ordered_qty}</strong> pcs
                            {Number(item.bonus_qty) > 0 && (
                              <span className="text-amber-600 text-[10px] ml-1 font-semibold">+{item.bonus_qty} free</span>
                            )}
                          </span>
                          <span className="text-xs font-bold text-slate-900 min-w-[70px] text-right font-mono">
                            ৳ {lineNet.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedItemId(item.id);
                              }}
                              className="text-slate-400 hover:text-blue-600 p-1 rounded-md transition"
                              title="Edit item details"
                            >
                              <span className="text-[11px] font-semibold text-blue-600 hidden sm:inline">Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveDraftItem(item.id);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition"
                              title="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // B. Active Workstation Card (~260px) for active focal item
                  return (
                    <div
                      key={item.id}
                      className="border-2 border-blue-500 bg-white shadow-md rounded-2xl p-3.5 sm:p-4 space-y-3.5 ring-4 ring-blue-50/50 w-full min-w-0 box-border transition-all animate-in fade-in-50 duration-150"
                    >
                      {/* Active Header: Indicator, Done / Collapse & Delete */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-blue-100 w-full min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                          </span>
                          <span className="text-xs font-bold text-blue-700 tracking-wide uppercase">
                            Active Workstation #{itemIndex}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedItemId(null)}
                            className="h-7 px-2.5 rounded-lg text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-100/70 gap-1"
                            title="Done editing / Collapse"
                          >
                            <Check className="h-3.5 w-3.5 text-blue-600" />
                            <span>Done</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveDraftItem(item.id)}
                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                            title="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Medicine Name with Suggestion Input */}
                      <div className="w-full min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">
                            Medicine Name *
                          </Label>
                          <span className="text-[10px] text-slate-400 font-medium truncate">
                            Select catalog or type generic
                          </span>
                        </div>
                        <Input
                          ref={(el) => {
                            medicineInputRefs.current[item.id] = el;
                          }}
                          list="medicine-catalog-list"
                          placeholder="e.g. Napa Extra 500mg"
                          value={item.medicine_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleSelectCatalogMedicine(item.id, val);
                          }}
                          className="h-9 bg-white rounded-lg text-xs w-full border-blue-200 focus-visible:ring-blue-500"
                        />
                      </div>

                      {/* Row 1: Batch Number & Expiry (2 Columns) */}
                      <div className="grid grid-cols-2 gap-2 w-full min-w-0">
                        <div className="w-full min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-semibold flex items-center justify-between mb-1">
                            <span className="truncate">Batch #</span>
                            <span className="text-[9px] text-slate-400 font-normal lowercase hidden xs:inline">(optional)</span>
                          </Label>
                          <Input
                            placeholder="e.g. BTH-01"
                            value={item.batch_number || ""}
                            onChange={(e) => handleItemChange(item.id, "batch_number", e.target.value)}
                            className="h-8 sm:h-9 rounded-lg text-xs font-mono w-full min-w-0 bg-white border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-500"
                          />
                        </div>

                        <div className="w-full min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-semibold flex items-center justify-between mb-1">
                            <span className="truncate">Expiry Date</span>
                            <span className="text-[9px] text-slate-400 font-normal lowercase hidden xs:inline">(optional)</span>
                          </Label>
                          <div className="relative w-full min-w-0">
                            <button
                              type="button"
                              onClick={() => handleOpenExpiryPicker(item.id, item.expiry_date)}
                              className="h-8 sm:h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 w-full min-w-0 flex items-center justify-between text-xs transition-colors text-left cursor-pointer active:scale-[0.99]"
                            >
                              <span className={item.expiry_date ? "text-slate-900 font-bold font-mono" : "text-slate-400"}>
                                {item.expiry_date || "MM/YYYY"}
                              </span>
                              <Calendar className="h-3.5 w-3.5 text-[#A32D37] shrink-0" />
                            </button>
                            {item.expiry_date && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleItemChange(item.id, "expiry_date", "");
                                }}
                                className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-0.5 rounded transition-colors cursor-pointer"
                                title="Clear expiry date"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Trade Price & Billed Qty (2 Columns) */}
                      <div className="grid grid-cols-2 gap-2 w-full min-w-0 pt-0.5">
                        <div className="w-full min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 truncate">
                            Trade Price (TP ৳)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.trade_price}
                            onChange={(e) =>
                              handleItemChange(item.id, "trade_price", parseFloat(e.target.value) || 0)
                            }
                            className="h-8 sm:h-9 bg-white rounded-lg text-xs font-semibold w-full min-w-0"
                          />
                        </div>

                        <div className="w-full min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1 truncate">
                            Billed Qty
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.ordered_qty}
                            onChange={(e) =>
                              handleItemChange(item.id, "ordered_qty", parseInt(e.target.value) || 0)
                            }
                            className="h-8 sm:h-9 bg-white rounded-lg text-xs text-left sm:text-center font-semibold w-full min-w-0"
                          />
                        </div>
                      </div>

                      {/* Row 3: Bonus Qty & Discount % (2 Columns) */}
                      <div className="grid grid-cols-2 gap-2 w-full min-w-0 pt-0.5">
                        <div className="w-full min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1 mb-1 truncate">
                            <Gift className="h-3 w-3 text-amber-500 shrink-0" />
                            <span>Free Bonus</span>
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.bonus_qty}
                            onChange={(e) =>
                              handleItemChange(item.id, "bonus_qty", parseInt(e.target.value) || 0)
                            }
                            className="h-8 sm:h-9 bg-white rounded-lg text-xs text-left sm:text-center text-amber-600 font-semibold w-full min-w-0"
                          />
                        </div>

                        <div className="w-full min-w-0">
                          <Label className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1 mb-1 truncate">
                            <Percent className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>Disc. %</span>
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={item.discount_percent}
                            onChange={(e) =>
                              handleItemChange(item.id, "discount_percent", parseFloat(e.target.value) || 0)
                            }
                            className="h-8 sm:h-9 bg-white rounded-lg text-xs text-left sm:text-center text-emerald-600 font-semibold w-full min-w-0"
                          />
                        </div>
                      </div>

                      {/* Line Subtotal Row */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 w-full min-w-0">
                        <span className="text-[11px] text-slate-500 uppercase font-semibold">
                          Line Subtotal:
                        </span>
                        <span className="text-sm font-bold text-slate-900 font-mono">
                          ৳ {lineNet.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <datalist id="medicine-catalog-list">
                {catalogOptions.map((med) => (
                  <option key={med.id} value={med.name} />
                ))}
              </datalist>
            </div>

            {/* Financial Summary & Discounts Box */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 sm:p-4 space-y-3 w-full min-w-0 box-border">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Invoice Financial Summary
              </span>

              <div className="grid grid-cols-2 gap-2.5 w-full min-w-0">
                <div className="w-full min-w-0">
                  <Label className="text-xs font-semibold text-slate-700 truncate block">
                    Invoice Rebate (Flat ৳)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={draftInvoiceDiscount}
                    onChange={(e) => setDraftInvoiceDiscount(parseFloat(e.target.value) || 0)}
                    className="mt-1 h-9 rounded-lg text-xs bg-white w-full min-w-0"
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block truncate">
                    Special vendor scheme deduction
                  </span>
                </div>

                <div className="w-full min-w-0">
                  <Label className="text-xs font-semibold text-slate-700 truncate block">
                    VAT / Tax (৳)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={draftVatAmount}
                    onChange={(e) => setDraftVatAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1 h-9 rounded-lg text-xs bg-white w-full min-w-0"
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block truncate">
                    Govt. pharmaceutical tax if applicable
                  </span>
                </div>
              </div>

              {/* Summary Calculation Strip */}
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Trade Value (TP × Qty):</span>
                  <span className="font-semibold text-slate-800">
                    ৳ {invoiceCalculations.grossTotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Item Discounts & Schemes:</span>
                  <span>- ৳ {invoiceCalculations.itemDiscountsTotal.toFixed(2)}</span>
                </div>
                {invoiceCalculations.invoiceDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Invoice Special Rebate:</span>
                    <span>- ৳ {invoiceCalculations.invoiceDiscount.toFixed(2)}</span>
                  </div>
                )}
                {invoiceCalculations.vat > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>VAT / Taxes:</span>
                    <span>+ ৳ {invoiceCalculations.vat.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-amber-700 text-[11px] font-semibold">
                  <span>Total Bonus (Free Units):</span>
                  <span>+{invoiceCalculations.totalFreeUnits} units free</span>
                </div>
                <div className="flex justify-between text-sm sm:text-base font-extrabold text-slate-900 pt-2 border-t border-slate-300">
                  <span>Final Net Payable:</span>
                  <span className="text-blue-700">
                    ৳ {invoiceCalculations.finalNetPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Order Notes / Challan Remarks</Label>
              <Textarea
                placeholder="e.g. Invoiced under Summer Promotional Scheme, delivery to Central Warehouse"
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                className="mt-1 text-xs rounded-lg bg-white"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-col sm:flex-row items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              className="w-full sm:w-auto rounded-lg text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => handleSavePurchaseOrder("draft")}
              className="w-full sm:w-auto rounded-lg text-xs font-semibold"
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSavePurchaseOrder("received")}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              {isSubmitting ? "Receiving & Saving..." : "Receive Stock & Save Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. GOODS RECEIVED NOTE (GRN) PHYSICAL RECEIVING MODAL */}
      <Dialog open={grnDialogOpen} onOpenChange={setGrnDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-2xl min-w-0 rounded-2xl p-3.5 sm:p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden box-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
              Goods Received Note (GRN Reconciliation)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-950">
              <p className="font-semibold flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Dual Inventory & Ledger Reconciliation:</span>
              </p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Confirming this GRN will increment your physical warehouse medicine stock and immediately post a
                credit bill of{" "}
                <strong className="font-bold">
                  ৳ {Number(selectedPO?.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </strong>{" "}
                to {selectedPO?.supplier?.name}'s automated ledger.
              </p>
            </div>

            {/* GRN Items Grid */}
            <div className="space-y-2.5">
              {grnItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-xs">{item.medicine_name}</span>
                    <span className="text-[11px] text-slate-500">
                      Ordered: <strong className="text-slate-800">{item.ordered_qty}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                        Received Qty
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={item.received_qty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setGrnItems((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, received_qty: val } : r))
                          );
                        }}
                        className="h-8 bg-white text-xs font-semibold text-center"
                      />
                    </div>

                    <div>
                      <Label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                        Confirmed Batch #
                      </Label>
                      <Input
                        value={item.batch_number}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGrnItems((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, batch_number: val } : r))
                          );
                        }}
                        className="h-8 bg-white text-xs font-mono"
                      />
                    </div>

                    <div>
                      <Label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                        Confirmed Expiry
                      </Label>
                      <Input
                        type="date"
                        value={item.expiry_date}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGrnItems((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, expiry_date: val } : r))
                          );
                        }}
                        className="h-8 bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGrnDialogOpen(false)}
              className="rounded-lg text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirmGRN}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              {isSubmitting ? "Ingesting..." : "Confirm GRN & Receive Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. VIEW GRN & INVOICE DETAILS MODAL */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-2xl min-w-0 rounded-2xl p-3.5 sm:p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden box-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              Invoice & GRN Summary: {selectedPO?.po_number}
            </DialogTitle>
          </DialogHeader>

          {selectedPO && (
            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Supplier</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedPO.supplier?.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Godown Location</span>
                  <span className="font-bold text-slate-900 text-sm">{getWarehouseName(selectedPO.warehouse_id)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Received Date</span>
                  <span className="font-semibold text-slate-800">
                    {selectedPO.received_at
                      ? new Date(selectedPO.received_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "Pending"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Final Net Payable</span>
                  <span className="font-extrabold text-blue-700 text-sm">
                    ৳ {Number(selectedPO.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {selectedPO.notes && (
                <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-slate-700 text-[11px]">
                  <strong>Invoice Scheme Breakdown:</strong> {selectedPO.notes}
                </div>
              )}

              {/* Items List */}
              <div className="border border-slate-200/80 rounded-xl overflow-x-auto w-full">
                <table className="w-full text-left text-xs min-w-[360px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-3 text-center">Ordered</th>
                      <th className="py-2 px-3 text-center">Received</th>
                      <th className="py-2 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {(selectedPO.items || []).map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-medium text-slate-900">{it.medicine_name}</td>
                        <td className="py-2 px-3 text-center font-semibold text-slate-600">{it.ordered_qty}</td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-600">{it.received_qty || it.ordered_qty}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          ৳ {Number(it.total_cost || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailsDialogOpen(false)}
              className="rounded-lg text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMPORT PENDING REQUISITIONS MODAL (PIPELINE BRIDGE) */}
      <Dialog open={importReqDialogOpen} onOpenChange={setImportReqDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-2xl min-w-0 rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                  Import Pending Requisitions
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select an open requisition or confirmed SR draft to hydrate and receive goods without retyping items.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-3">
            {loadingPendingReqs ? (
              <div className="py-12 text-center">
                <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-xs text-slate-500">Checking open requisitions...</p>
              </div>
            ) : pendingRequisitions.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center">
                <ClipboardList className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800 mb-1">
                  No Pending Requisitions Found
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
                  All previous requisitions have either been converted into received invoices or none have been drafted yet.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setImportReqDialogOpen(false);
                    navigate("/procurement/smart-requisitions");
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs h-8 px-3 gap-1.5 font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Go to Smart Order Planner</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-0.5">
                {pendingRequisitions.map((req) => {
                  const itemCount = Array.isArray(req.requisition_items) ? req.requisition_items.length : 0;
                  const supName = req.suppliers?.name || "Manufacturer / Vendor";
                  return (
                    <div
                      key={req.id}
                      className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:shadow-sm transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900">
                            {req.requisition_number}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-bold bg-amber-50 text-amber-700 border-amber-200"
                          >
                            {req.status === "sr_confirmed"
                              ? "SR Confirmed"
                              : req.status === "shared"
                              ? "Shared with Rep"
                              : "Draft"}
                          </Badge>
                          <span className="text-[11px] text-slate-400">
                            • {new Date(req.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 flex-wrap">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-blue-600 shrink-0" />
                            <span className="truncate max-w-[180px]">{supName}</span>
                          </span>
                          <span className="text-slate-400">|</span>
                          <span>{itemCount} medicine items</span>
                          <span className="text-slate-400">|</span>
                          <span className="font-bold text-slate-900">
                            ৳ {Number(req.total_estimated_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {req.notes && (
                          <p className="text-[11px] text-slate-500 italic mt-0.5 truncate">
                            Note: {req.notes}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                        <Button
                          size="sm"
                          onClick={() => handleSelectRequisitionToImport(req)}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold h-8 px-3 gap-1 shadow-xs"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          <span>Import & Ingest</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportReqDialogOpen(false)}
              className="rounded-xl border-slate-200 text-xs h-9 px-4"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Month-Year Expiry Dialog (Active Radix Portal Modal) */}
      <DialogPrimitive.Root open={expiryPickerOpen} onOpenChange={setExpiryPickerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
            style={{ pointerEvents: "auto" }}
          />
          <DialogPrimitive.Content
            className="fixed left-[50%] top-[50%] z-[9999] translate-x-[-50%] translate-y-[-50%] bg-white rounded-2xl shadow-2xl border border-gray-200 w-[92vw] max-w-xs p-4 sm:p-5 animate-in zoom-in-95 duration-150 outline-hidden select-none"
            style={{ pointerEvents: "auto" }}
            onPointerDownOutside={() => setExpiryPickerOpen(false)}
          >
            <DialogPrimitive.Title className="text-sm sm:text-base font-bold text-gray-900 text-center mb-3">
              Select Expiry Month
            </DialogPrimitive.Title>

            {/* Year Stepper: < 2026 > with left/right buttons */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-xl mb-3.5 border border-gray-200/80">
              <button
                type="button"
                onClick={() => setExpiryPickerYear((y) => y - 1)}
                className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors cursor-pointer active:scale-95"
                aria-label="Previous Year"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm sm:text-base font-extrabold text-gray-900 tracking-wide font-mono">
                {expiryPickerYear}
              </span>
              <button
                type="button"
                onClick={() => setExpiryPickerYear((y) => y + 1)}
                className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors cursor-pointer active:scale-95"
                aria-label="Next Year"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* 3x4 Grid Containing all 12 Months (Jan - Dec) with solid maroon pill highlight (#A32D37) */}
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {MONTHS_SHORT.map((monthName, idx) => {
                const isSelected = expiryPickerMonth === idx;
                return (
                  <button
                    key={monthName}
                    type="button"
                    onClick={() => setExpiryPickerMonth(idx)}
                    className={`py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 cursor-pointer ${
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

            {/* Actions: CLEAR, CANCEL, and OK */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClearExpiryPicker}
                className="text-[11px] font-semibold text-gray-400 hover:text-rose-600 transition-colors cursor-pointer px-1 py-1"
              >
                CLEAR
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpiryPickerOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExpiryPicker}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#A32D37] hover:bg-[#8D232C] rounded-lg shadow-sm shadow-[#A32D37]/20 transition-all active:scale-95 cursor-pointer"
                >
                  OK
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
