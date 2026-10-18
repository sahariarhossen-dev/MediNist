import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { warehouseStorage } from "@/services/warehouseStorage";
import {
  ArrowLeft,
  Plus,
  Search,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Clock,
  Edit2,
  Trash2,
  RefreshCw,
  Wallet,
  Sparkles,
  Receipt,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  Calendar,
  MessageCircle,
  UserCheck,
  Truck,
  Check,
  ChevronsUpDown,
  X,
  Tag,
  Factory,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Supplier, SupplierPaymentTerms, DAYS_OF_WEEK, Manufacturer } from "@/types/warehouseErp";

const PRESET_SUPPLIERS = [
  {
    name: "Square Pharmaceuticals PLC",
    contact_person: "M. Hasan (Territory Manager)",
    phone: "+880 1711-001122",
    email: "depot.dhaka@squarepharma.com",
    address: "Square Centre, 48 Mohakhali C/A, Dhaka",
    payment_terms: "net_30" as SupplierPaymentTerms,
    order_days: [1, 4], // Monday, Thursday
    lead_time_days: 1,
    minimum_order_amount: 5000,
    sr_name: "Md. Hasan Mahmud",
    sr_phone: "+880 1711-001122",
    sr_whatsapp: "+880 1711-001122",
  },
  {
    name: "Beximco Pharmaceuticals Ltd.",
    contact_person: "Tanvir Ahmed (Distribution Officer)",
    phone: "+880 1713-334455",
    email: "supply@beximcopharma.com",
    address: "19 Dhanmondi R/A, Road 7, Dhaka",
    payment_terms: "net_30" as SupplierPaymentTerms,
    order_days: [2, 5], // Tuesday, Friday
    lead_time_days: 1,
    minimum_order_amount: 4000,
    sr_name: "Tanvir Ahmed (Distribution)",
    sr_phone: "+880 1713-334455",
    sr_whatsapp: "+880 1713-334455",
  },
  {
    name: "Incepta Pharmaceuticals Ltd.",
    contact_person: "Dr. K. Rahman (Institutional Lead)",
    phone: "+880 1755-667788",
    email: "orders@inceptapharma.com",
    address: "40 Shahid Tajuddin Ahmed Sarani, Tejgaon, Dhaka",
    payment_terms: "net_15" as SupplierPaymentTerms,
    order_days: [0, 3], // Sunday, Wednesday
    lead_time_days: 1,
    minimum_order_amount: 3000,
    sr_name: "Dr. K. Rahman",
    sr_phone: "+880 1755-667788",
    sr_whatsapp: "+880 1755-667788",
  },
  {
    name: "Renata PLC",
    contact_person: "Ashiqur Zaman (Supply Chain)",
    phone: "+880 1819-998877",
    email: "sales@renata-ltd.com",
    address: "Plot 1, Milk Vita Road, Section 7, Mirpur, Dhaka",
    payment_terms: "net_30" as SupplierPaymentTerms,
    order_days: [1, 3], // Monday, Wednesday
    lead_time_days: 2,
    minimum_order_amount: 3500,
    sr_name: "Ashiqur Zaman",
    sr_phone: "+880 1819-998877",
    sr_whatsapp: "+880 1819-998877",
  },
  {
    name: "ACI Limited (Healthcare Division)",
    contact_person: "Farhan Kabir (Area Depot)",
    phone: "+880 1912-112233",
    email: "pharma.sales@aci-bd.com",
    address: "ACI Centre, 245 Tejgaon I/A, Dhaka",
    payment_terms: "cash" as SupplierPaymentTerms,
    order_days: [0, 4], // Sunday, Thursday
    lead_time_days: 1,
    minimum_order_amount: 2500,
    sr_name: "Farhan Kabir",
    sr_phone: "+880 1912-112233",
    sr_whatsapp: "+880 1912-112233",
  },
];

export default function Suppliers() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { pharmacyId, branchId, branchName } = useActiveWorkspace();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Supply Chain Pipeline Bridge Stats per Supplier
  const [supplierShortageCounts, setSupplierShortageCounts] = useState<Record<string, number>>({});
  const [supplierPendingReqCounts, setSupplierPendingReqCounts] = useState<Record<string, number>>({});

  // Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ledger Statement & Payment State
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [activeLedgerSupplier, setActiveLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [ledgerTab, setLedgerTab] = useState<"payment" | "bill">("payment");
  const [billAmount, setBillAmount] = useState("");
  const [billReference, setBillReference] = useState("");
  const [isRecordingBill, setIsRecordingBill] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Derived Financials for Active Supplier Modal
  const { totalBilled, totalPaid } = useMemo(() => {
    let billed = 0;
    let paid = 0;
    for (const entry of ledgerEntries) {
      billed += Number(entry.credit) || 0;
      paid += Number(entry.debit) || 0;
    }
    return { totalBilled: billed, totalPaid: paid };
  }, [ledgerEntries]);

  // Form Fields
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    payment_terms: "net_30" as SupplierPaymentTerms,
    opening_balance: 0,
    balance: 0,
    order_days: [] as number[],
    lead_time_days: 1,
    minimum_order_amount: 0,
    sr_name: "",
    sr_phone: "",
    sr_whatsapp: "",
  });

  // Manufacturer linking state & combobox
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [selectedManufacturerIds, setSelectedManufacturerIds] = useState<string[]>([]);
  const [supplierManufacturerMap, setSupplierManufacturerMap] = useState<Record<string, Manufacturer[]>>({});
  const [loadingManufacturers, setLoadingManufacturers] = useState(false);
  const [mfgSearchQuery, setMfgSearchQuery] = useState("");
  const [isAddingNewMfg, setIsAddingNewMfg] = useState(false);
  const [newMfgName, setNewMfgName] = useState("");
  const [isMfgPopoverOpen, setIsMfgPopoverOpen] = useState(false);

  const [totalPaidDisbursed, setTotalPaidDisbursed] = useState(0);

  // 1. Fetch all active manufacturers from central catalog
  const fetchManufacturers = useCallback(async () => {
    try {
      setLoadingManufacturers(true);
      const { data, error } = await supabase
        .from("manufacturers")
        .select("id, name, code, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!error && Array.isArray(data)) {
        setManufacturers(data as Manufacturer[]);
      }
    } catch (err) {
      console.warn("Failed to load manufacturers:", err);
    } finally {
      setLoadingManufacturers(false);
    }
  }, []);

  // 2. Main Suppliers & Metrics Fetch
  const fetchSuppliers = useCallback(async () => {
    if (!pharmacyId) {
      setSuppliers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await warehouseStorage.getSuppliers(pharmacyId, branchId);
      const supplierList = (data || []) as Supplier[];
      setSuppliers(supplierList);

      const supIds = supplierList.map((s) => s.id);

      // Construct branch-scoped medicines and requisitions queries (strictly isolated to active branch)
      let medsQuery = supabase
        .from("medicines")
        .select("id, company_name, manufacturer_id, preferred_supplier_id, stock_quantity, stock_alert, location_id")
        .eq("pharmacy_id", pharmacyId);
      if (branchId) {
        medsQuery = medsQuery.eq("location_id", branchId);
      }

      let reqsQuery = (supabase.from("requisitions" as any) as any)
        .select("id, supplier_id, status, location_id")
        .eq("pharmacy_id", pharmacyId)
        .in("status", ["draft", "shared", "sr_confirmed"]);
      if (branchId) {
        reqsQuery = reqsQuery.eq("location_id", branchId);
      }

      let ledgerQuery = (supabase.from("supplier_ledger_entries" as any) as any)
        .select("debit, transaction_type, location_id")
        .eq("pharmacy_id", pharmacyId);
      if (branchId) {
        ledgerQuery = ledgerQuery.eq("location_id", branchId);
      }

      // Fetch junction mappings, ledgers, medicines, and requisitions in parallel
      const [smRes, ledgerRes, medsRes, reqsRes] = await Promise.all([
        supIds.length > 0
          ? supabase
              .from("supplier_manufacturers")
              .select("supplier_id, manufacturer_id, manufacturers(id, name, code, is_active)")
              .eq("pharmacy_id", pharmacyId)
              .in("supplier_id", supIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        ledgerQuery,
        medsQuery,
        reqsQuery,
      ]);

      // 1. Process supplier-manufacturer mapping
      const mapping: Record<string, Manufacturer[]> = {};
      if (Array.isArray(smRes.data)) {
        smRes.data.forEach((row: any) => {
          if (row.supplier_id && row.manufacturers) {
            if (!mapping[row.supplier_id]) mapping[row.supplier_id] = [];
            mapping[row.supplier_id].push(row.manufacturers as Manufacturer);
          }
        });
      }
      setSupplierManufacturerMap(mapping);

      // 2. Aggregate total paid from ledger entries
      let totalPaidSum = 0;
      if (Array.isArray(ledgerRes.data)) {
        totalPaidSum = ledgerRes.data.reduce((sum: number, entry: any) => {
          const deb = Number(entry.debit) || 0;
          return sum + (entry.transaction_type === "payment" || deb > 0 ? deb : 0);
        }, 0);
      } else {
        const ledgerKey = branchId
          ? `warehouse_supplier_ledger_${pharmacyId}_${branchId}`
          : `warehouse_supplier_ledger_${pharmacyId}`;
        const localLedger = JSON.parse(localStorage.getItem(ledgerKey) || "[]");
        totalPaidSum = localLedger.reduce((sum: number, entry: any) => {
          const deb = Number(entry.debit) || 0;
          return sum + (entry.transaction_type === "payment" || deb > 0 ? deb : 0);
        }, 0);
      }
      setTotalPaidDisbursed(totalPaidSum);

      // 3. Calculate shortages mapped to suppliers with hybrid ID & String support using fresh mapping
      if (Array.isArray(medsRes.data)) {
        const shortageMap: Record<string, number> = {};
        const shortMeds = medsRes.data.filter(
          (m: any) => Number(m.stock_quantity || 0) <= Number(m.stock_alert || 10)
        );

        supplierList.forEach((sup) => {
          const linkedMfs = mapping[sup.id] || [];
          const linkedMfgIds = new Set(linkedMfs.map((mf) => mf.id));
          const linkedMfgNames = new Set(linkedMfs.map((mf) => mf.name.toLowerCase()));

          const matchedCount = shortMeds.filter((m: any) => {
            if (m.preferred_supplier_id === sup.id) return true;
            if (m.manufacturer_id && linkedMfgIds.has(m.manufacturer_id)) return true;
            if (m.company_name && linkedMfgNames.has(m.company_name.toLowerCase())) return true;
            if (
              !m.preferred_supplier_id &&
              m.company_name &&
              sup.name.toLowerCase().includes(m.company_name.toLowerCase())
            )
              return true;
            return false;
          }).length;

          shortageMap[sup.id] = matchedCount;
        });
        setSupplierShortageCounts(shortageMap);
      }

      // 4. Calculate pending requisitions mapped to suppliers
      if (Array.isArray(reqsRes.data)) {
        const reqCountMap: Record<string, number> = {};
        reqsRes.data.forEach((r: any) => {
          if (r.supplier_id) {
            reqCountMap[r.supplier_id] = (reqCountMap[r.supplier_id] || 0) + 1;
          }
        });
        setSupplierPendingReqCounts(reqCountMap);
      }
    } catch (err: any) {
      console.warn("[Suppliers] fetch error:", err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [pharmacyId, branchId]);

  useEffect(() => {
    fetchSuppliers();
    fetchManufacturers();
  }, [fetchSuppliers, fetchManufacturers]);

  // Listen to global workspace change events (dispatched by LocationContext / ActiveBranchCard)
  useEffect(() => {
    const handleWorkspaceChanged = () => {
      setActiveLedgerSupplier(null);
      setLedgerOpen(false);
      setDialogOpen(false);
      fetchSuppliers();
    };
    window.addEventListener("medinist:workspace-changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("medinist:workspace-changed", handleWorkspaceChanged);
    };
  }, [fetchSuppliers]);

  // Quick-Add / Register New Manufacturer
  const handleQuickAddManufacturer = async (nameToAdd?: string) => {
    const rawName = (nameToAdd || newMfgName || mfgSearchQuery).trim();
    if (!rawName) {
      toast.error("Please enter a manufacturer name");
      return;
    }

    // Check if already in active list
    const foundLocal = manufacturers.find(
      (m) => m.name.toLowerCase() === rawName.toLowerCase()
    );
    if (foundLocal) {
      if (!selectedManufacturerIds.includes(foundLocal.id)) {
        setSelectedManufacturerIds((prev) => [...prev, foundLocal.id]);
      }
      setMfgSearchQuery("");
      setNewMfgName("");
      setIsAddingNewMfg(false);
      toast.info(`"${foundLocal.name}" is already registered and selected`);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("manufacturers")
        .insert({
          name: rawName,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          // If already in DB
          const { data: existingDb } = await supabase
            .from("manufacturers")
            .select("id, name, code, is_active")
            .ilike("name", rawName)
            .single();

          if (existingDb) {
            setManufacturers((prev) =>
              [...prev.filter((m) => m.id !== existingDb.id), existingDb as Manufacturer].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
            );
            if (!selectedManufacturerIds.includes(existingDb.id)) {
              setSelectedManufacturerIds((prev) => [...prev, existingDb.id]);
            }
            toast.success(`Selected "${existingDb.name}"`);
            setMfgSearchQuery("");
            setNewMfgName("");
            setIsAddingNewMfg(false);
            return;
          }
        }
        throw error;
      }

      if (data) {
        const newMfg = data as Manufacturer;
        setManufacturers((prev) => [...prev, newMfg].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedManufacturerIds((prev) => [...prev, newMfg.id]);
        toast.success(`Manufacturer "${newMfg.name}" created and linked!`);
        setMfgSearchQuery("");
        setNewMfgName("");
        setIsAddingNewMfg(false);

        // Convenient auto-fill for supplier name if empty
        if (!formData.name.trim()) {
          setFormData((prev) => ({ ...prev, name: newMfg.name }));
        }
      }
    } catch (err: any) {
      console.error("Failed to create manufacturer:", err);
      toast.error(err.message || "Could not register manufacturer");
    }
  };

  const handleOpenAddDialog = () => {
    setEditingSupplier(null);
    setSelectedManufacturerIds([]);
    setMfgSearchQuery("");
    setIsAddingNewMfg(false);
    setNewMfgName("");
    setIsMfgPopoverOpen(false);
    setFormData({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      payment_terms: "net_30",
      opening_balance: 0,
      balance: 0,
      order_days: [],
      lead_time_days: 1,
      minimum_order_amount: 0,
      sr_name: "",
      sr_phone: "",
      sr_whatsapp: "",
    });
    setDialogOpen(true);
  };

  const handleOpenEditDialog = async (sup: Supplier) => {
    setEditingSupplier(sup);
    setMfgSearchQuery("");
    setIsAddingNewMfg(false);
    setNewMfgName("");
    setIsMfgPopoverOpen(false);

    // Pre-populate selected manufacturers from cache or DB
    const cachedMfs = supplierManufacturerMap[sup.id] || [];
    if (cachedMfs.length > 0) {
      setSelectedManufacturerIds(cachedMfs.map((m) => m.id));
    } else if (pharmacyId) {
      try {
        const { data } = await supabase
          .from("supplier_manufacturers")
          .select("manufacturer_id")
          .eq("pharmacy_id", pharmacyId)
          .eq("supplier_id", sup.id);

        if (data && data.length > 0) {
          setSelectedManufacturerIds(data.map((r: any) => r.manufacturer_id));
        } else {
          setSelectedManufacturerIds([]);
        }
      } catch {
        setSelectedManufacturerIds([]);
      }
    } else {
      setSelectedManufacturerIds([]);
    }

    setFormData({
      name: sup.name,
      contact_person: sup.contact_person || "",
      phone: sup.phone || "",
      email: sup.email || "",
      address: sup.address || "",
      payment_terms: sup.payment_terms || "net_30",
      opening_balance: Number(sup.opening_balance ?? sup.balance ?? 0),
      balance: Number(sup.balance) || 0,
      order_days: Array.isArray(sup.order_days) ? sup.order_days : [],
      lead_time_days: sup.lead_time_days ?? 1,
      minimum_order_amount: Number(sup.minimum_order_amount) || 0,
      sr_name: sup.sr_name || "",
      sr_phone: sup.sr_phone || "",
      sr_whatsapp: sup.sr_whatsapp || "",
    });
    setDialogOpen(true);
  };

  const handleOpenLedger = async (sup: Supplier) => {
    if (!pharmacyId) return;
    setActiveLedgerSupplier(sup);
    setLedgerOpen(true);
    setLedgerLoading(true);
    setPaymentAmount("");
    setPaymentNote("");
    setBillAmount("");
    setBillReference("");
    setLedgerTab("payment");
    try {
      const entries = await warehouseStorage.getSupplierLedger(pharmacyId, sup.id, branchId);
      setLedgerEntries(entries);
    } catch (err) {
      console.warn("[Suppliers] Ledger fetch error:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleRecordBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pharmacyId || !activeLedgerSupplier) return;
    const amt = parseFloat(billAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid bill amount");
      return;
    }

    try {
      setIsRecordingBill(true);
      await warehouseStorage.recordSupplierLedgerEntry(
        pharmacyId,
        activeLedgerSupplier.id,
        {
          transaction_type: "bill",
          amount: amt,
          description: billReference.trim() ? `Manual Bill / Invoice: ${billReference.trim()}` : "Manual Purchase Bill",
        },
        branchId
      );
      toast.success(`Bill of ৳ ${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })} recorded`);
      setBillAmount("");
      setBillReference("");
      const updatedEntries = await warehouseStorage.getSupplierLedger(pharmacyId, activeLedgerSupplier.id, branchId);
      setLedgerEntries(updatedEntries);
      fetchSuppliers();
      setActiveLedgerSupplier((prev) =>
        prev ? { ...prev, balance: (Number(prev.balance) || 0) + amt } : null
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to record bill");
    } finally {
      setIsRecordingBill(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pharmacyId || !activeLedgerSupplier) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    try {
      setIsRecordingPayment(true);
      await warehouseStorage.recordSupplierLedgerEntry(
        pharmacyId,
        activeLedgerSupplier.id,
        {
          transaction_type: "payment",
          amount: amt,
          description: paymentNote.trim() || "Supplier disbursement payment",
        },
        branchId
      );
      toast.success(`Payment of ৳ ${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })} recorded`);
      setPaymentAmount("");
      setPaymentNote("");
      // Refresh ledger & supplier state
      const updatedEntries = await warehouseStorage.getSupplierLedger(pharmacyId, activeLedgerSupplier.id, branchId);
      setLedgerEntries(updatedEntries);
      fetchSuppliers();
      // Update active supplier local balance in modal
      setActiveLedgerSupplier((prev) =>
        prev ? { ...prev, balance: Math.max(0, (Number(prev.balance) || 0) - amt) } : null
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pharmacyId) return;

    // Derive name from selected manufacturers or contact details if empty
    const selectedMfgNames = manufacturers
      .filter((m) => selectedManufacturerIds.includes(m.id))
      .map((m) => m.name);

    let resolvedName = formData.name.trim();
    if (!resolvedName) {
      if (selectedMfgNames.length > 0) {
        resolvedName = selectedMfgNames.join(", ");
      } else if (formData.sr_name?.trim()) {
        resolvedName = `${formData.sr_name.trim()} (SR)`;
      } else if (formData.contact_person?.trim()) {
        resolvedName = formData.contact_person.trim();
      }
    }

    if (!resolvedName) {
      toast.error("Please select at least one pharmaceutical company");
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: resolvedName,
        contact_person: formData.contact_person.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        payment_terms: formData.payment_terms,
        opening_balance: formData.opening_balance,
        order_days: formData.order_days,
        lead_time_days: Math.max(1, Math.floor(Number(formData.lead_time_days) || 1)),
        minimum_order_amount: Math.max(0, Number(formData.minimum_order_amount) || 0),
        sr_name: formData.sr_name.trim() || null,
        sr_phone: formData.sr_phone.trim() || null,
        sr_whatsapp: formData.sr_whatsapp.trim() || null,
      };

      let savedSupplierId: string | undefined = editingSupplier?.id;

      if (editingSupplier) {
        const saved = await warehouseStorage.saveSupplier(
          pharmacyId,
          {
            id: editingSupplier.id,
            location_id: (editingSupplier as any).location_id || branchId,
            ...payload,
          },
          branchId
        );
        savedSupplierId = saved?.id || editingSupplier.id;
        toast.success("Supplier details & schedule updated");
      } else {
        const saved = await warehouseStorage.saveSupplier(
          pharmacyId,
          {
            ...payload,
            location_id: branchId,
            balance: formData.opening_balance,
          },
          branchId
        );
        savedSupplierId = saved?.id;
        toast.success("New supplier registered with order routine");
      }

      // Synchronize supplier_manufacturers junction table
      if (savedSupplierId) {
        try {
          // Delete existing links for clean replacement
          await supabase
            .from("supplier_manufacturers")
            .delete()
            .eq("pharmacy_id", pharmacyId)
            .eq("supplier_id", savedSupplierId);

          if (selectedManufacturerIds.length > 0) {
            const rowsToInsert = selectedManufacturerIds.map((mfgId) => ({
              pharmacy_id: pharmacyId,
              supplier_id: savedSupplierId,
              manufacturer_id: mfgId,
            }));

            const { error: smError } = await supabase
              .from("supplier_manufacturers")
              .insert(rowsToInsert);

            if (smError) {
              console.warn("Error inserting supplier_manufacturers:", smError);
              toast.warning("Supplier saved, but manufacturer links failed to update");
            } else {
              const activeMapped = manufacturers.filter((m) =>
                selectedManufacturerIds.includes(m.id)
              );
              setSupplierManufacturerMap((prev) => ({
                ...prev,
                [savedSupplierId!]: activeMapped,
              }));
            }
          } else {
            setSupplierManufacturerMap((prev) => ({
              ...prev,
              [savedSupplierId!]: [],
            }));
          }
        } catch (smErr) {
          console.warn("Could not sync supplier_manufacturers:", smErr);
        }
      }

      setDialogOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save supplier");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier): Promise<boolean> => {
    if (!pharmacyId) return false;

    try {
      setIsDeleting(true);
      await warehouseStorage.deleteSupplier(pharmacyId, supplier.id, branchId);
      toast.success(`${supplier.name} deleted successfully`);
      setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
      setDeleteConfirmOpen(false);
      setLedgerOpen(false);
      setActiveLedgerSupplier(null);
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete supplier");
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeedPresets = async () => {
    if (!pharmacyId) return;
    try {
      setIsSubmitting(true);
      for (const p of PRESET_SUPPLIERS) {
        await warehouseStorage.saveSupplier(
          pharmacyId,
          {
            name: p.name,
            contact_person: p.contact_person,
            phone: p.phone,
            email: p.email,
            address: p.address,
            payment_terms: p.payment_terms as any,
            balance: 0,
            order_days: p.order_days,
            lead_time_days: p.lead_time_days,
            minimum_order_amount: p.minimum_order_amount,
            sr_name: p.sr_name,
            sr_phone: p.sr_phone,
            sr_whatsapp: p.sr_whatsapp,
            location_id: branchId,
          },
          branchId
        );
      }

      toast.success("Sample pharmaceutical manufacturers loaded");
      fetchSuppliers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to seed presets");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  const { totalSuppliers, accountsWithDues, totalOutstandingBalance, totalPaidAmount } = useMemo(() => {
    let totalDues = 0;
    let withDues = 0;
    let supplierPaidSum = 0;

    for (let i = 0; i < suppliers.length; i++) {
      const s = suppliers[i];
      const bal = Number(s.balance) || 0;
      if (bal > 0) {
        totalDues += bal;
        withDues++;
      }
      supplierPaidSum += Number((s as any).total_paid) || 0;
    }

    return {
      totalSuppliers: suppliers.length,
      accountsWithDues: withDues,
      totalOutstandingBalance: totalDues,
      totalPaidAmount: Math.max(supplierPaidSum, totalPaidDisbursed),
    };
  }, [suppliers, totalPaidDisbursed]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-5xl mx-auto px-4 py-5 pb-24">
      {/* Header & Actions Consolidated Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        {/* Top Block: Title & Subtitle */}
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Suppliers & Vendors
            </h1>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
              <Building2 className="h-3 w-3 text-slate-500" />
              {branchName || "Active Branch"}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Central pharmaceutical manufacturer registry & vendor accounts
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            size="sm"
            onClick={handleOpenAddDialog}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs h-9 px-4 gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>Add Supplier</span>
          </Button>
        </div>
      </div>

      {/* Symmetrical 4-Card KPI Metrics Grid (2x2 on Mobile, 4-Col on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* KPI 1: Total Suppliers */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Total Suppliers
            </span>
            <span className="text-lg font-bold text-gray-900 mt-1 block tracking-tight">
              {totalSuppliers}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
        </div>

        {/* KPI 2: Accounts with Dues */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Accounts with Dues
            </span>
            <span className="text-lg font-bold text-amber-600 mt-1 block tracking-tight">
              {accountsWithDues}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4" />
          </div>
        </div>

        {/* KPI 3: Total Payable Due */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Total Payable Due
            </span>
            <span className="text-lg font-bold text-purple-700 mt-1 block tracking-tight truncate">
              ৳ {totalOutstandingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Wallet className="h-4 w-4" />
          </div>
        </div>

        {/* KPI 4: Total Paid */}
        <div className="bg-white border border-gray-100 shadow-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase block whitespace-normal break-words leading-tight">
              Total Paid
            </span>
            <span className="text-lg font-bold text-emerald-600 mt-1 block tracking-tight truncate">
              ৳ {totalPaidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by company name, contact person, phone, or depot..."
          className="pl-9 h-9 text-xs bg-white rounded-xl border-gray-200 shadow-xs focus-visible:ring-blue-600"
        />
      </div>

      {/* Suppliers List */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="animate-spin h-7 w-7 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-2.5" />
          <p className="text-xs text-slate-500">Loading supplier registry...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-gray-100 shadow-xs text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            {searchQuery ? "No suppliers match your search" : "No suppliers registered yet"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {searchQuery
              ? "Try adjusting your search terms or clear the filter."
              : "Register your pharmaceutical distributors to issue purchase orders and track shipments."}
          </p>
          {!searchQuery && (
            <div className="flex items-center justify-center">
              <Button
                onClick={handleOpenAddDialog}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs h-8 px-4 font-semibold shadow-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Supplier
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              onClick={() => handleOpenLedger(supplier)}
              className="group rounded-xl border border-gray-100 bg-white shadow-xs hover:border-gray-300 hover:shadow-md transition-all active:scale-[0.99] p-3.5 flex flex-col justify-between cursor-pointer"
            >
              <div>
                {/* Card Header: Company, Contact Person, Terms Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-gray-900 leading-tight truncate group-hover:text-blue-600 transition-colors">
                      {supplier.name}
                    </h3>
                    {supplier.contact_person && (
                      <p className="text-xs text-gray-500 mt-0.5 font-normal truncate">
                        {supplier.contact_person}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium border border-blue-100 bg-blue-50 text-blue-700 capitalize shrink-0 shadow-none"
                  >
                    {supplier.payment_terms ? supplier.payment_terms.replace("_", " ") : "Net 30"}
                  </Badge>
                </div>

                {/* Compact Inline/Flex-wrap Metadata Strip */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 mt-2.5 pt-2.5 border-t border-gray-50">
                  {supplier.phone && (
                    <a
                      href={`tel:${supplier.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors text-[11px]"
                    >
                      <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="truncate">{supplier.phone}</span>
                    </a>
                  )}
                  {supplier.email && (
                    <a
                      href={`mailto:${supplier.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors text-[11px]"
                    >
                      <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="truncate max-w-[150px] sm:max-w-[200px]">{supplier.email}</span>
                    </a>
                  )}
                  {supplier.address && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="truncate max-w-[180px] sm:max-w-[240px]">{supplier.address}</span>
                    </div>
                  )}
                </div>

                {/* Represented Manufacturer Brands Strip */}
                {supplierManufacturerMap[supplier.id] && supplierManufacturerMap[supplier.id].length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-gray-50">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-0.5">
                      <Factory className="h-2.5 w-2.5 text-blue-500" /> Brands:
                    </span>
                    {supplierManufacturerMap[supplier.id].slice(0, 4).map((mf) => (
                      <span
                        key={mf.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50/80 text-blue-700 border border-blue-200/50 font-medium"
                      >
                        {mf.name}
                      </span>
                    ))}
                    {supplierManufacturerMap[supplier.id].length > 4 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        +{supplierManufacturerMap[supplier.id].length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Routine Visit Days, Active Shortages & SR Badge Bar */}
                <div className="mt-2.5 pt-2 border-t border-gray-50 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  {/* Routine Days Pill Tags */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                    {Array.isArray(supplier.order_days) && supplier.order_days.length > 0 ? (
                      supplier.order_days.map((d) => {
                        const isToday = new Date().getDay() === d;
                        const dayObj = DAYS_OF_WEEK.find((item) => item.day === d);
                        return (
                          <span
                            key={d}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                              isToday
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {dayObj?.short || d}
                            {isToday && " • Today"}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">No schedule set</span>
                    )}
                  </div>

                  {/* Representative Contact & WhatsApp Quick Action */}
                  {supplier.sr_whatsapp && (
                    <a
                      href={`https://wa.me/${supplier.sr_whatsapp.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      title={`Open WhatsApp chat with ${supplier.sr_name || "SR"}`}
                    >
                      <MessageCircle className="h-3 w-3 text-emerald-600" />
                      <span>{supplier.sr_name ? supplier.sr_name.split(" ")[0] : "SR"}</span>
                    </a>
                  )}
                </div>

                {/* Supply Chain Integration Strip: Shortages, Pending Requisitions & Direct Order Action */}
                <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(supplierShortageCounts[supplier.id] || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle className="h-3 w-3 text-rose-600" />
                        <span>{supplierShortageCounts[supplier.id]} Low Stock Alert</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-100">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span>Stock OK</span>
                      </span>
                    )}

                    {(supplierPendingReqCounts[supplier.id] || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="h-3 w-3 text-amber-600" />
                        <span>{supplierPendingReqCounts[supplier.id]} Pending Requisition</span>
                      </span>
                    )}
                  </div>

                  {/* Deep Link Action: Create Requisition for this Vendor */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/procurement/smart-requisitions?vendor_id=${supplier.id}`);
                    }}
                    className="h-7 px-2.5 text-[11px] rounded-lg border-purple-200 text-purple-700 bg-purple-50/50 hover:bg-purple-100 hover:text-purple-800 gap-1 font-semibold shrink-0"
                    title={`Create direct requisition order for ${supplier.name}`}
                  >
                    <Sparkles className="h-3 w-3 text-purple-600" />
                    <span>Create Requisition</span>
                  </Button>
                </div>
              </div>

              {/* Structured Card Footer */}
              <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 tracking-wider uppercase block">
                    PAYABLE DUE
                  </span>
                  <span
                    className={`text-sm font-bold tracking-tight ${
                      Number(supplier.balance || 0) > 0 ? "text-red-600" : "text-gray-700"
                    }`}
                  >
                    ৳ {Number(supplier.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-blue-600 transition-colors">
                  <span className="text-[11px] font-medium hidden sm:inline">Profile & Ledger</span>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              {editingSupplier ? "Edit Supplier Details" : "Add Pharmaceutical Supplier"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveSupplier} className="space-y-4 py-2">
            {editingSupplier && (
              <div className="bg-purple-50/80 border border-purple-200/80 rounded-xl p-3 text-xs text-purple-900 flex items-start gap-2.5">
                <Receipt className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-purple-950 flex items-center gap-2">
                    <span>Automated Ledger Balance:</span>
                    <span className="font-bold text-sm">
                      ৳ {Number(editingSupplier.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-700 mt-0.5">
                    This balance is automatically reconciled from received purchase orders and payment disbursements.
                  </p>
                </div>
              </div>
            )}

            {/* Represented Pharmaceutical Companies (Sleek Combobox / Floating Popover) */}
            <div className="relative">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Factory className="h-3.5 w-3.5 text-blue-600" />
                  <span>Pharmaceutical Company / Brand *</span>
                </Label>
                {selectedManufacturerIds.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-full">
                      {selectedManufacturerIds.length} linked
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedManufacturerIds([]);
                        setFormData((prev) => ({ ...prev, name: "" }));
                      }}
                      className="text-[10px] text-rose-500 hover:text-rose-700 font-medium cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Input Trigger Button (Matches standard h-10 rounded-xl) */}
              <button
                type="button"
                onClick={() => setIsMfgPopoverOpen((prev) => !prev)}
                className={`mt-1 w-full min-h-[40px] px-3 py-1.5 rounded-xl border bg-white text-left text-xs transition-colors flex items-center justify-between gap-2 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                  isMfgPopoverOpen
                    ? "border-blue-500 ring-2 ring-blue-500/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {selectedManufacturerIds.length === 0 ? (
                  <span className="text-slate-400">Select pharmaceutical companies (e.g. Square, Incepta, Beximco)...</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0 py-0.5">
                    {selectedManufacturerIds.map((id) => {
                      const mfg = manufacturers.find((m) => m.id === id);
                      if (!mfg) return null;
                      return (
                        <span
                          key={mfg.id}
                          className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200/80 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                        >
                          <span className="truncate max-w-[130px]">{mfg.name}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedManufacturerIds((prev) => {
                                const next = prev.filter((item) => item !== id);
                                const names = manufacturers
                                  .filter((m) => next.includes(m.id))
                                  .map((m) => m.name)
                                  .join(", ");
                                setFormData((f) => ({ ...f, name: names }));
                                return next;
                              });
                            }}
                            className="text-blue-400 hover:text-rose-600 p-0.5 -mr-0.5 rounded-sm transition-colors cursor-pointer"
                            title={`Remove ${mfg.name}`}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
                <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
              </button>

              {/* Floating Dropdown / Popover on Click */}
              {isMfgPopoverOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setIsMfgPopoverOpen(false);
                      setIsAddingNewMfg(false);
                    }}
                  />

                  {/* Absolute Floating Menu */}
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl p-2.5 space-y-2 animate-in fade-in-0 zoom-in-95 duration-100">
                    {/* Search Field */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        placeholder="Search company (Square, Incepta, Beximco)..."
                        value={mfgSearchQuery}
                        onChange={(e) => setMfgSearchQuery(e.target.value)}
                        className="pl-8 pr-8 h-8.5 text-xs bg-slate-50/70 border-slate-200 rounded-lg"
                        autoFocus
                      />
                      {mfgSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setMfgSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Scrollable list with checkmark selection */}
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                      {loadingManufacturers ? (
                        <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                          <span>Loading catalog...</span>
                        </div>
                      ) : (
                        <>
                          {manufacturers
                            .filter((m) =>
                              m.name.toLowerCase().includes(mfgSearchQuery.toLowerCase().trim())
                            )
                            .map((mfg) => {
                              const isSelected = selectedManufacturerIds.includes(mfg.id);
                              return (
                                <button
                                  key={mfg.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedManufacturerIds((prev) => {
                                      const next = isSelected
                                        ? prev.filter((id) => id !== mfg.id)
                                        : [...prev, mfg.id];
                                      const names = manufacturers
                                        .filter((m) => next.includes(m.id))
                                        .map((m) => m.name)
                                        .join(", ");
                                      setFormData((f) => ({ ...f, name: names }));
                                      return next;
                                    });
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                    isSelected
                                      ? "bg-blue-50/70 text-blue-900 font-semibold"
                                      : "text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Building2
                                      className={`h-3.5 w-3.5 shrink-0 ${
                                        isSelected ? "text-blue-600" : "text-slate-400"
                                      }`}
                                    />
                                    <span className="truncate">{mfg.name}</span>
                                    {mfg.code && (
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        [{mfg.code}]
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected
                                        ? "bg-blue-600 border-blue-600 text-white"
                                        : "border-slate-300 bg-white"
                                    }`}
                                  >
                                    {isSelected && <Check className="h-3 w-3" />}
                                  </div>
                                </button>
                              );
                            })}

                          {/* Quick Create option when no matching company */}
                          {mfgSearchQuery.trim() &&
                            !manufacturers.some(
                              (m) =>
                                m.name.toLowerCase() === mfgSearchQuery.trim().toLowerCase()
                            ) && (
                              <div className="p-2 bg-blue-50/50">
                                <button
                                  type="button"
                                  onClick={() => handleQuickAddManufacturer(mfgSearchQuery)}
                                  className="w-full py-1.5 px-2.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  <span>Add "{mfgSearchQuery.trim()}" as New Company</span>
                                </button>
                              </div>
                            )}
                        </>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    {!isAddingNewMfg ? (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setIsAddingNewMfg(true)}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>+ Register New Company</span>
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsMfgPopoverOpen(false)}
                          className="h-7 text-xs text-slate-600 hover:bg-slate-100 rounded-lg px-2.5"
                        >
                          Done
                        </Button>
                      </div>
                    ) : (
                      <div className="p-2 bg-slate-50 border border-blue-200 rounded-xl space-y-1.5">
                        <Label className="text-[11px] font-bold text-slate-700">Quick Register</Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            placeholder="e.g. Radiant Pharmaceuticals Ltd."
                            value={newMfgName}
                            onChange={(e) => setNewMfgName(e.target.value)}
                            className="h-7.5 text-xs bg-white rounded-lg"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleQuickAddManufacturer()}
                            className="h-7.5 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0 px-2.5 rounded-lg"
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsAddingNewMfg(false);
                              setNewMfgName("");
                            }}
                            className="h-7.5 text-xs text-slate-500 shrink-0 px-1.5 rounded-lg"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Contact Person</Label>
                <Input
                  placeholder="e.g. Area Manager"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  className="mt-1 h-10 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Phone</Label>
                <Input
                  placeholder="e.g. +880 1711..."
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Email</Label>
                <Input
                  type="email"
                  placeholder="orders@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 h-10 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Payment Terms</Label>
                <Select
                  value={formData.payment_terms}
                  onValueChange={(val: SupplierPaymentTerms) =>
                    setFormData({ ...formData, payment_terms: val })
                  }
                >
                  <SelectTrigger className="mt-1 h-10 rounded-xl">
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash on Delivery</SelectItem>
                    <SelectItem value="net_15">Net 15 Days</SelectItem>
                    <SelectItem value="net_30">Net 30 Days</SelectItem>
                    <SelectItem value="net_60">Net 60 Days</SelectItem>
                    <SelectItem value="credit">Open Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Depot / Billing Address</Label>
              <Input
                placeholder="e.g. Tejgaon Industrial Area, Dhaka"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="mt-1 h-10 rounded-xl"
              />
            </div>

            {/* Routine Visit Days & Order Schedule (For Smart Requisitions) */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-blue-100 text-blue-700">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Routine Visit Days</h4>
                    <p className="text-[11px] text-slate-500">Days when representative visits to take orders</p>
                  </div>
                </div>
                {formData.order_days.length > 0 && (
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {formData.order_days.length} day{formData.order_days.length > 1 ? "s" : ""}/wk
                  </span>
                )}
              </div>

              {/* Day Toggle Buttons (0=Sun to 6=Sat) */}
              <div className="grid grid-cols-7 gap-1.5 pt-1">
                {DAYS_OF_WEEK.map(({ day, short, label }) => {
                  const isSelected = formData.order_days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      title={label}
                      onClick={() => {
                        const next = isSelected
                          ? formData.order_days.filter((d) => d !== day)
                          : [...formData.order_days, day].sort((a, b) => a - b);
                        setFormData({ ...formData, order_days: next });
                      }}
                      className={`h-9 flex flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-all border ${
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white shadow-xs scale-102"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span>{short}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Lead Time (Days)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    placeholder="1"
                    value={formData.lead_time_days}
                    onChange={(e) =>
                      setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 1 })
                    }
                    className="mt-1 h-9 rounded-xl bg-white"
                  />
                  <span className="text-[10px] text-slate-400">Delivery turnaround in days</span>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Min. Order Amount (৳)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0.00"
                    value={formData.minimum_order_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, minimum_order_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="mt-1 h-9 rounded-xl bg-white"
                  />
                  <span className="text-[10px] text-slate-400">Minimum vendor order limit</span>
                </div>
              </div>
            </div>

            {/* Field Representative (SR) Details */}
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Field Representative (SR) Details</h4>
                  <p className="text-[11px] text-slate-500">Contact for direct magic link & WhatsApp orders</p>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Representative Name (SR / MPO)</Label>
                <Input
                  placeholder="e.g. Md. Tanvir Ahmed (Territory Officer)"
                  value={formData.sr_name}
                  onChange={(e) => setFormData({ ...formData, sr_name: e.target.value })}
                  className="mt-1 h-9 rounded-xl bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">SR Phone Number</Label>
                  <Input
                    placeholder="e.g. +880 1711-223344"
                    value={formData.sr_phone}
                    onChange={(e) => setFormData({ ...formData, sr_phone: e.target.value })}
                    className="mt-1 h-9 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>SR WhatsApp</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">1-Click Share</span>
                  </Label>
                  <Input
                    placeholder="e.g. 01711223344"
                    value={formData.sr_whatsapp}
                    onChange={(e) => setFormData({ ...formData, sr_whatsapp: e.target.value })}
                    className="mt-1 h-9 rounded-xl bg-white"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">
                  {editingSupplier ? "Opening Balance (৳)" : "Initial Opening Balance (৳)"}
                </Label>
                <span className="text-[10px] text-slate-400">Baseline Migration</span>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.opening_balance}
                onChange={(e) =>
                  setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })
                }
                className="mt-1 h-10 rounded-xl"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Subsequent bills and disbursements will update the outstanding balance automatically.
              </p>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="rounded-xl border-gray-200"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
              >
                {isSubmitting ? "Saving..." : editingSupplier ? "Update Supplier" : "Register Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unified Supplier Profile & Ledger Modal (Detail View) */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent
          hideCloseButton={true}
          className="w-[95vw] sm:w-[90vw] max-w-2xl max-h-[90vh] rounded-2xl p-4 sm:p-6 overflow-y-auto flex flex-col bg-white border border-slate-200"
        >
          {/* Unified Premium Hero Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
            <DialogHeader className="p-0 space-y-0 text-left">
              {/* Row 1: The Single-Line Header (CRITICAL) */}
              <div className="flex flex-row items-center w-full gap-3">
                {/* Left: Company Icon */}
                <div className="bg-blue-50 text-blue-600 p-2.5 rounded-lg shrink-0 flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>

                {/* Middle: Company Name (flex-1 min-w-0 with truncate) */}
                <div className="flex-1 min-w-0">
                  <DialogTitle className="truncate text-lg font-bold text-slate-900 tracking-tight text-left">
                    {activeLedgerSupplier?.name}
                  </DialogTitle>
                </div>

                {/* Right: Edit and Delete icons */}
                <div className="flex flex-row items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const cur = activeLedgerSupplier;
                      if (!cur) return;
                      setLedgerOpen(false);
                      handleOpenEditDialog(cur);
                    }}
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit Supplier Details"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete Supplier"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Row 2 & 3: Contact & Payment Terms (Cleanly Stacked) */}
              <div className="mt-4 space-y-2 text-left">
                {activeLedgerSupplier?.contact_person ? (
                  <p className="text-sm font-medium text-slate-700">
                    <span className="text-slate-400 font-normal">Primary Contact: </span>
                    {activeLedgerSupplier.contact_person}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-400 italic">No primary contact listed</p>
                )}

                <div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 capitalize">
                    {activeLedgerSupplier?.payment_terms
                      ? activeLedgerSupplier.payment_terms.replace("_", " ")
                      : "Net 30"}
                  </span>
                </div>
              </div>
            </DialogHeader>

            {/* Row 4: Contact Details (Phone, Email, Address) */}
            <hr className="border-slate-100 my-4" />

            <div className="space-y-2.5 text-sm text-slate-600">
              <div className="flex items-center gap-2.5 min-w-0">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                {activeLedgerSupplier?.phone ? (
                  <a
                    href={`tel:${activeLedgerSupplier.phone}`}
                    className="hover:text-blue-600 transition-colors truncate"
                  >
                    {activeLedgerSupplier.phone}
                  </a>
                ) : (
                  <span className="text-slate-400 italic text-xs">Not provided</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                {activeLedgerSupplier?.email ? (
                  <a
                    href={`mailto:${activeLedgerSupplier.email}`}
                    className="hover:text-blue-600 transition-colors truncate"
                  >
                    {activeLedgerSupplier.email}
                  </a>
                ) : (
                  <span className="text-slate-400 italic text-xs">Not provided</span>
                )}
              </div>

              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <span className="truncate" title={activeLedgerSupplier?.address || ""}>
                  {activeLedgerSupplier?.address || (
                    <span className="text-slate-400 italic text-xs">Not provided</span>
                  )}
                </span>
              </div>

              {/* Routine Days & SR Details Strip */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    <span>Visits:</span>
                  </span>
                  {Array.isArray(activeLedgerSupplier?.order_days) && activeLedgerSupplier.order_days.length > 0 ? (
                    activeLedgerSupplier.order_days.map((d) => {
                      const isToday = new Date().getDay() === d;
                      const dayObj = DAYS_OF_WEEK.find((item) => item.day === d);
                      return (
                        <span
                          key={d}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            isToday
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {dayObj?.short || d}
                          {isToday && " • Today"}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs text-slate-400 italic">No schedule set</span>
                  )}
                </div>

                {activeLedgerSupplier?.sr_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{activeLedgerSupplier.sr_name}</span>
                    </span>
                    {activeLedgerSupplier.sr_whatsapp && (
                      <a
                        href={`https://wa.me/${activeLedgerSupplier.sr_whatsapp.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <span>WhatsApp SR</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sleek Financial Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 my-1">
            {/* Card 1: Total Billed */}
            <div className="bg-white border border-slate-200/90 shadow-xs rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Billed
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-900 mt-1 block tracking-tight truncate">
                ৳ {totalBilled.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">Purchases & Invoices</span>
            </div>

            {/* Card 2: Total Paid */}
            <div className="bg-white border border-slate-200/90 shadow-xs rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Paid
              </span>
              <span className="text-base sm:text-lg font-bold text-emerald-600 mt-1 block tracking-tight truncate">
                ৳ {totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600/80 mt-0.5">Settled disbursements</span>
            </div>

            {/* Card 3: Outstanding Due */}
            <div
              className={`border shadow-xs rounded-xl p-3 flex flex-col justify-between ${
                Number(activeLedgerSupplier?.balance || 0) > 0
                  ? "bg-rose-50/40 border-rose-200"
                  : "bg-emerald-50/30 border-emerald-200"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider block text-slate-500">
                Outstanding Due
              </span>
              <span
                className={`text-base sm:text-lg font-extrabold mt-1 block tracking-tight truncate ${
                  Number(activeLedgerSupplier?.balance || 0) > 0 ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                ৳ {Number(activeLedgerSupplier?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`text-[10px] mt-0.5 font-medium ${
                  Number(activeLedgerSupplier?.balance || 0) > 0 ? "text-rose-600/80" : "text-emerald-600"
                }`}
              >
                {Number(activeLedgerSupplier?.balance || 0) > 0 ? "Payment required" : "All cleared"}
              </span>
            </div>
          </div>

          {/* Tabbed Action Area: Record Payment vs Add Manual Bill */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 my-1 shadow-xs">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setLedgerTab("payment")}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  ledgerTab === "payment"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Record Payment</span>
              </button>
              <button
                type="button"
                onClick={() => setLedgerTab("bill")}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  ledgerTab === "bill"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Add Manual Bill</span>
              </button>
            </div>

            {ledgerTab === "payment" ? (
              <form onSubmit={handleRecordPayment} className="space-y-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                    <span>Disburse Payment (Reduces Due)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Instantly reconciles dues</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      ৳
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="h-10 pl-7 pr-3 rounded-lg border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-900 bg-white"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Input
                      placeholder="Ref: Cheque, Bank, Cash..."
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      className="h-10 px-3 rounded-lg border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      type="submit"
                      disabled={isRecordingPayment}
                      className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
                    >
                      {isRecordingPayment ? "Recording..." : "Record Payment"}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRecordBill} className="space-y-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Add Manual Purchase Bill (Increases Due)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Adds payable liability</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      ৳
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={billAmount}
                      onChange={(e) => setBillAmount(e.target.value)}
                      className="h-10 pl-7 pr-3 rounded-lg border-indigo-200 focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-900 bg-white"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Input
                      placeholder="Invoice / Memo Reference..."
                      value={billReference}
                      onChange={(e) => setBillReference(e.target.value)}
                      className="h-10 px-3 rounded-lg border-indigo-200 focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      type="submit"
                      disabled={isRecordingBill}
                      className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
                    >
                      {isRecordingBill ? "Saving..." : "Record Bill"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Sleek Activity & Ledger Feed */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-slate-500" />
                <span>Activity & Ledger Feed</span>
              </h4>
              <span className="text-[11px] font-medium text-slate-400">{ledgerEntries.length} Events</span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
              {ledgerLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading ledger activity...</div>
              ) : ledgerEntries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <Receipt className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                  No transaction history recorded yet. New purchase orders and disbursements will appear here automatically.
                </div>
              ) : (
                ledgerEntries.map((entry) => {
                  const isPayment = entry.transaction_type === "payment";
                  const isBill = entry.transaction_type === "bill";
                  const amount = isPayment ? Number(entry.debit) : Number(entry.credit);

                  return (
                    <div
                      key={entry.id}
                      className="bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl p-2.5 flex items-center justify-between gap-3 transition-colors shadow-xs"
                    >
                      {/* Left: Icon & Description + Date */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isPayment
                              ? "bg-emerald-50 text-emerald-600"
                              : isBill
                              ? "bg-rose-50 text-rose-600"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isPayment ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isBill ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <Receipt className="h-4 w-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {entry.description ||
                                (isPayment ? "Supplier Payment" : isBill ? "Purchase Bill" : "Adjustment")}
                            </p>
                            <span
                              className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold tracking-wider ${
                                isPayment
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isBill
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {entry.transaction_type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(entry.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Right: Amount */}
                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs sm:text-sm font-bold tracking-tight ${
                            isPayment ? "text-emerald-600" : "text-slate-900"
                          }`}
                        >
                          {isPayment ? "-" : "+"} ৳ {amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {isPayment ? "Disbursed" : "Liability Added"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLedgerOpen(false)}
              className="rounded-xl border-slate-200 text-xs"
            >
              Close Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Safety Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              Delete Supplier?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500 mt-2 leading-relaxed">
              This action cannot be undone. Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-slate-800">
                {activeLedgerSupplier?.name}
              </span>
              ? This may affect linked purchase records and ledgers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 !flex-row items-center justify-end gap-3 w-full sm:space-x-0">
            <AlertDialogCancel
              disabled={isDeleting}
              className="!mt-0 flex-1 sm:flex-initial rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 h-10 px-4 font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={isDeleting}
              onClick={() => {
                if (activeLedgerSupplier) {
                  handleDeleteSupplier(activeLedgerSupplier);
                }
              }}
              className="flex-1 sm:flex-initial bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl font-semibold gap-2 h-10 px-5 shadow-xs hover:shadow-md transition-all active:scale-[0.98] cursor-pointer inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>Delete Supplier</span>
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
