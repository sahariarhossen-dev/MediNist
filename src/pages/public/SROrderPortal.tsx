import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  FileText,
  Printer,
  Share2,
  Truck,
  Check,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface OrderPortalItem {
  medicine_name: string;
  generic_name?: string | null;
  company_name?: string | null;
  pack_mode: "box" | "strip" | "piece";
  boxes_to_order?: number;
  strips_to_order?: number;
  final_order_qty_pcs: number;
  pieces_per_box?: number;
  pcs_per_strip?: number;
}

interface OrderPortalData {
  valid: boolean;
  error?: string;
  requisition_number: string;
  location_id?: string | null;
  branch_code?: string | null;
  branch_name?: string | null;
  branch_address?: string | null;
  branch_phone?: string | null;
  issuing_pharmacy_name?: string | null;
  issuing_pharmacy_address?: string | null;
  issuing_pharmacy_phone?: string | null;
  pharmacy_name: string;
  pharmacy_phone?: string | null;
  pharmacy_address?: string | null;
  supplier_name: string;
  sr_name?: string | null;
  created_at: string;
  expires_at: string;
  status: string;
  notes?: string | null;
  sr_acknowledged_at?: string | null;
  sr_estimated_delivery?: string | null;
  sr_notes?: string | null;
  items: OrderPortalItem[];
  location?: {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
    code?: string | null;
  } | null;
}

export default function SROrderPortal() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderPortalData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Acknowledgment form states
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [deliveryEstimate, setDeliveryEstimate] = useState("");
  const [srNotesInput, setSrNotesInput] = useState("");
  const [acknowledgedSuccess, setAcknowledgedSuccess] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!token) {
      setErrorMsg("Missing order token in URL.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Extract URL search parameters passed from the active branch dispatcher
      const urlParams = new URLSearchParams(window.location.search);
      const urlBranchName = urlParams.get("branch") || urlParams.get("b");
      const urlBranchAddress = urlParams.get("addr") || urlParams.get("a");
      const urlBranchPhone = urlParams.get("phone") || urlParams.get("p");

      const { data, error } = await supabase.rpc("get_public_sr_order_portal", {
        _token: token,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || !data.valid) {
        setErrorMsg(data?.error || "This order link is invalid, expired, or has been revoked.");
        return;
      }

      // Priority resolution: Branch identity strictly supersedes parent organization ("City Shop")
      const resolvedBranchName =
        urlBranchName ||
        data.location?.name ||
        data.branch_name ||
        data.issuing_pharmacy_name ||
        data.pharmacy_name ||
        "Pharmacy Order";

      const resolvedBranchAddress =
        urlBranchAddress ||
        data.location?.address ||
        data.branch_address ||
        data.issuing_pharmacy_address ||
        data.pharmacy_address ||
        null;

      const resolvedBranchPhone =
        urlBranchPhone ||
        data.location?.phone ||
        data.branch_phone ||
        data.issuing_pharmacy_phone ||
        data.pharmacy_phone ||
        null;

      const resolvedBranchCode =
        data.branch_code ||
        data.location?.code ||
        null;

      const resolvedOrder: OrderPortalData = {
        ...(data as OrderPortalData),
        issuing_pharmacy_name: resolvedBranchName,
        issuing_pharmacy_address: resolvedBranchAddress,
        issuing_pharmacy_phone: resolvedBranchPhone,
        pharmacy_name: resolvedBranchName,
        pharmacy_address: resolvedBranchAddress,
        pharmacy_phone: resolvedBranchPhone,
        branch_code: resolvedBranchCode,
      };

      setOrder(resolvedOrder);
      if (data.sr_acknowledged_at) {
        setAcknowledgedSuccess(true);
      }

      // Dynamic branded page title and description for SR portal
      if (resolvedOrder.requisition_number) {
        const orderTitle = `Official Purchase Order #${resolvedOrder.requisition_number} — ${resolvedBranchName}`;
        const orderDesc = `Verified Procurement Order for ${resolvedOrder.supplier_name || "Supplier"} • ${resolvedOrder.items?.length || 0} items listed. Confirm delivery via MediNist.`;
        document.title = `${orderTitle} | MediNist`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", orderDesc);
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute("content", orderTitle);
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute("content", orderDesc);
      }
    } catch (err: any) {
      console.error("[SROrderPortal] Fetch error:", err);
      setErrorMsg(err.message || "Could not load order details.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleSubmitAcknowledgment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setIsAcknowledging(true);
      const { data, error } = await supabase.rpc("submit_sr_order_acknowledgment", {
        _token: token,
        _notes: srNotesInput.trim() || null,
        _estimated_delivery: null, // text notes capture delivery commitment cleanly
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || "Could not acknowledge order");
      }

      toast.success("Order acknowledged! The pharmacy has been notified.");
      setAcknowledgedSuccess(true);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "confirmed",
              sr_acknowledged_at: new Date().toISOString(),
              sr_notes: srNotesInput.trim() || "Confirmed by Representative",
            }
          : null
      );
    } catch (err: any) {
      console.error("[SROrderPortal] Acknowledgment error:", err);
      toast.error(err.message || "Failed to confirm order");
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleShareLink = () => {
    const displayBranch =
      order?.location?.name ||
      order?.issuing_pharmacy_name ||
      order?.branch_name ||
      order?.pharmacy_name ||
      "Pharmacy";
    if (navigator.share) {
      navigator.share({
        title: `Order #${order?.requisition_number} - ${displayBranch}`,
        text: `Medicine purchase order from ${displayBranch}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Order link copied to clipboard!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center animate-pulse mb-3">
          <Truck className="h-6 w-6" />
        </div>
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2" />
        <p className="text-xs font-semibold text-slate-700">Loading Order Details...</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Validating secure magic link portal</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Order Link Unavailable</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            {errorMsg || "This order requisition link is invalid, expired, or has been revoked by the pharmacy."}
          </p>
          <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs text-slate-600 mb-5 border border-slate-100">
            <div className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Security & Integrity Policy</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Procurement order links expire automatically to prevent outdated deliveries. Please contact the pharmacy to issue a fresh magic link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] py-4 sm:py-8 px-3 sm:px-6 print:p-0 print:bg-white text-slate-900 font-sans">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        {/* Top Floating Actions Bar (Hidden on Print) */}
        <div className="flex items-center justify-between gap-2 px-1 print:hidden">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Verified Pharmacy Order</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleShareLink}
              className="rounded-xl border-slate-200 bg-white h-8 text-xs font-semibold px-2.5 gap-1.5 shadow-xs"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.print()}
              className="rounded-xl border-slate-200 bg-white h-8 text-xs font-semibold px-2.5 gap-1.5 shadow-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </Button>
          </div>
        </div>

        {/* The Digital Order Slip (Invoice Styling) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
          {/* Pharmacy Branding & Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full inline-block">
                    OFFICIAL PURCHASE REQUISITION
                  </span>
                  {(order.branch_code || order.location?.code) && (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300 bg-white/10 px-2 py-0.5 rounded-full inline-block">
                      BRANCH: {order.branch_code || order.location?.code}
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  {order.location?.name || order.issuing_pharmacy_name || order.branch_name || order.pharmacy_name || "Pharmacy Order"}
                </h1>
                {(order.location?.address || order.issuing_pharmacy_address || order.branch_address || order.pharmacy_address) && (
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{order.location?.address || order.issuing_pharmacy_address || order.branch_address || order.pharmacy_address}</span>
                  </p>
                )}
                {(order.location?.phone || order.issuing_pharmacy_phone || order.branch_phone || order.pharmacy_phone) && (
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <a
                      href={`tel:${order.location?.phone || order.issuing_pharmacy_phone || order.branch_phone || order.pharmacy_phone}`}
                      className="hover:text-emerald-400 font-semibold underline underline-offset-2"
                    >
                      {order.location?.phone || order.issuing_pharmacy_phone || order.branch_phone || order.pharmacy_phone}
                    </a>
                  </p>
                )}
              </div>

              {/* Order Tracking Badge */}
              <div className="text-left sm:text-right bg-white/10 sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-white/10 sm:border-none shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                  ORDER REFERENCE
                </span>
                <span className="text-sm font-mono font-bold text-white block mt-0.5">
                  {order.requisition_number}
                </span>
                <span className="text-[11px] text-slate-300 block mt-1">
                  Issued: {new Date(order.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Supplier & Representative Metadata Strip */}
          <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
                SUPPLIED TO DISTRIBUTOR
              </span>
              <strong className="text-sm font-bold text-slate-900 block mt-0.5">
                {order.supplier_name}
              </strong>
              {order.sr_name && (
                <span className="text-slate-600 block mt-0.5">
                  Attn: <strong>{order.sr_name}</strong> (Territory Officer)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge
                className={`text-xs px-2.5 py-1 font-bold rounded-lg shadow-none ${
                  order.status === "confirmed"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-blue-100 text-blue-800 border-blue-300"
                }`}
              >
                {order.status === "confirmed" ? "Acknowledged by Rep" : "Awaiting Rep Confirmation"}
              </Badge>
            </div>
          </div>

          {/* Special Instructions / Notes Banner */}
          {order.notes && (
            <div className="mx-4 sm:mx-6 mt-4 p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
              <FileText className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold text-amber-950 block">Pharmacy Delivery Instructions:</strong>
                <p className="mt-0.5 text-amber-900/90">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Requisition Medicine Line Items */}
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="h-4 w-4 text-blue-600" />
                <span>Requested Items ({order.items.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">Quantities to Dispatch</span>
            </div>

            <div className="divide-y divide-slate-100">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400 w-5">
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 leading-tight">
                        {item.medicine_name}
                      </h4>
                    </div>

                    <div className="pl-7 mt-0.5 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                      {item.generic_name && (
                        <span className="italic truncate">{item.generic_name}</span>
                      )}
                      {item.company_name && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                          {item.company_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* High Contrast Requested Quantity Badge */}
                  <div className="text-right shrink-0">
                    {item.pack_mode === "box" && item.boxes_to_order ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-xs">
                          📦 {item.boxes_to_order} Box{item.boxes_to_order > 1 ? "es" : ""}
                        </span>
                        <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                          (= {item.final_order_qty_pcs} pcs)
                        </span>
                      </div>
                    ) : item.pack_mode === "strip" && item.strips_to_order ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-xs">
                          💊 {item.strips_to_order} Strip{item.strips_to_order > 1 ? "s" : ""}
                        </span>
                        <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                          (= {item.final_order_qty_pcs} pcs)
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-slate-800 text-white shadow-xs">
                          {item.final_order_qty_pcs} Pieces
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SR Acknowledgment Banner / Action Section */}
          <div className="p-5 sm:p-6 bg-slate-50 border-t border-slate-200">
            {acknowledgedSuccess || order.sr_acknowledged_at ? (
              <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 text-emerald-900">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-950 mb-1">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Order Confirmed by Representative</span>
                </div>
                <p className="text-xs text-emerald-800">
                  Acknowledged on{" "}
                  <strong>{new Date(order.sr_acknowledged_at || Date.now()).toLocaleString()}</strong>.
                </p>
                {order.sr_notes && (
                  <p className="text-xs text-emerald-900/90 mt-2 pt-2 border-t border-emerald-200/60 font-medium">
                    Note to Pharmacy: "{order.sr_notes}"
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitAcknowledgment} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-purple-100 text-purple-700">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Field Representative Acknowledgment</h4>
                    <p className="text-[11px] text-slate-500">
                      Confirm order receipt and provide an estimated delivery window
                    </p>
                  </div>
                </div>

                <div>
                  <Input
                    placeholder="e.g. Received! Order punched into depot, delivery by 4 PM."
                    value={srNotesInput}
                    onChange={(e) => setSrNotesInput(e.target.value)}
                    className="h-10 text-xs rounded-xl bg-white border-slate-200"
                  />
                </div>

                {/* Quick Delivery Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 font-medium">Quick Presets:</span>
                  {[
                    "Delivery today by 5 PM",
                    "Delivery tomorrow morning",
                    "Stock confirmed with depot",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSrNotesInput(preset)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <Button
                  type="submit"
                  disabled={isAcknowledging}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 text-xs font-bold shadow-sm gap-2"
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>
                    {isAcknowledging ? "Confirming Order..." : "Acknowledge Order & Confirm Delivery"}
                  </span>
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-[11px] text-slate-400 text-center print:hidden">
          Powered by MediNist Smart Procurement Engine • End-to-end encrypted order link
        </p>
      </div>
    </div>
  );
}
