import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Phone, HandCoins, Pill, Plus, ShoppingCart, MapPin, FileText, MinusCircle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import QuickAddCustomerSheet, { type CustomerLite } from "@/components/customers/QuickAddCustomerSheet";
import ReceivePaymentSheet from "@/components/customers/ReceivePaymentSheet";
import AddManualDueSheet from "@/components/customers/AddManualDueSheet";
import AddPrescriptionSheet, { type Prescription } from "@/components/customers/AddPrescriptionSheet";
import LedgerTimeline, { type LedgerEntry } from "@/components/customers/LedgerTimeline";
import PrescriptionCard from "@/components/customers/PrescriptionCard";

type CustomerFull = CustomerLite & { total_due: number };

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const CustomerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [customer, setCustomer] = useState<CustomerFull | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [prescOpen, setPrescOpen] = useState(false);
  const [editingPresc, setEditingPresc] = useState<Prescription | null>(null);
  const [selectedPrescIds, setSelectedPrescIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [custRes, ledRes, prescRes] = await Promise.all([
      supabase.from("customers").select("id, name, phone, address, notes, total_due").eq("id", id).maybeSingle(),
      supabase.from("customer_ledger").select("id, entry_type, amount, description, sale_id, occurred_at").eq("customer_id", id).order("occurred_at", { ascending: false }),
      supabase.from("customer_prescriptions").select("id, customer_id, medicine_id, medicine_name, strength, dosage_frequency, dosage_timing, notes").eq("customer_id", id).order("created_at", { ascending: false }),
    ]);
    setCustomer((custRes.data as CustomerFull | null) ?? null);
    setLedger((ledRes.data || []) as LedgerEntry[]);
    setPrescriptions((prescRes.data || []) as Prescription[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Reset selection when the prescription list changes
  useEffect(() => {
    setSelectedPrescIds((prev) => {
      const valid = new Set(prescriptions.map((p) => p.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (valid.has(id)) next.add(id); });
      return next;
    });
  }, [prescriptions]);

  const togglePresc = (pid: string) => {
    setSelectedPrescIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const allSelected = prescriptions.length > 0 && selectedPrescIds.size === prescriptions.length;
  const someSelected = selectedPrescIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedPrescIds(new Set());
    else setSelectedPrescIds(new Set(prescriptions.map((p) => p.id)));
  };

  const handleAddSelectedToSale = () => {
    if (!customer || selectedPrescIds.size === 0) return;
    const ids = Array.from(selectedPrescIds).join(",");
    navigate(`/create-sale?customer=${customer.id}&prescribe=${ids}`);
  };

  const now = new Date();
  const monthYear = now.getFullYear();
  const monthIdx = now.getMonth();
  const monthly = ledger.reduce(
    (acc, e) => {
      const d = new Date(e.occurred_at);
      if (d.getFullYear() !== monthYear || d.getMonth() !== monthIdx) return acc;
      if (e.entry_type === "due") acc.sales += Number(e.amount);
      else acc.paid += Number(e.amount);
      return acc;
    },
    { sales: 0, paid: 0 },
  );
  const monthLabel = now.toLocaleString("en-US", { month: "long" });

  const handleDeletePresc = async (p: Prescription) => {
    if (!confirm(`Delete "${p.medicine_name}"?`)) return;
    const { error } = await supabase.from("customer_prescriptions").delete().eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Prescription deleted");
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md mx-auto">
        <AppHeader />
        <p className="text-center py-10 text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md mx-auto">
        <AppHeader />
        <div className="px-page pt-4">
          <button onClick={() => navigate("/more/customers")} className="text-sm text-blue-600 flex items-center gap-1">
            <ArrowLeft size={16} /> Back to Customers
          </button>
          <p className="mt-6 text-center text-sm text-gray-500">Customer not found.</p>
        </div>
      </div>
    );
  }

  const due = Number(customer.total_due);
  const dueColor = due > 0 ? "text-red-600" : due < 0 ? "text-green-600" : "text-gray-700";
  const dueLabel = due > 0 ? "Total Due" : due < 0 ? "Advance Balance" : "Settled";

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md mx-auto pb-16">
      <AppHeader />

      <div className="flex items-center justify-between px-page pt-3 pb-2">
        <button onClick={() => navigate("/more/customers")} className="flex items-center gap-1.5 text-gray-700">
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Customers</span>
        </button>
      </div>

      {/* Identity Card */}
      <div className="mx-page mt-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate">{customer.name}</p>
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">
                <Phone className="w-3.5 h-3.5" /> {customer.phone}
              </a>
            )}
          </div>
          <button onClick={() => setEditOpen(true)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50">
            <Pencil size={15} />
          </button>
        </div>
        {(customer.address || customer.notes) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {customer.address && (
              <div className="flex items-start gap-2 text-xs text-gray-600">
                <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="break-words">{customer.address}</span>
              </div>
            )}
            {customer.notes && (
              <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-2">
                <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="text-[11px] italic text-gray-600 break-words">{customer.notes}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Financial Card */}
      <div className="mx-page mt-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{dueLabel}</p>
          <p className={`text-3xl font-extrabold tabular-nums ${dueColor} mt-0.5`}>৳{formatBDT(Math.abs(due))}</p>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
          <div className="bg-red-50/60 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600/80">{monthLabel} Sales</p>
            <p className="text-base font-bold tabular-nums text-red-700 mt-0.5">৳{formatBDT(monthly.sales)}</p>
          </div>
          <div className="bg-green-50/60 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-green-700/80">{monthLabel} Paid</p>
            <p className="text-base font-bold tabular-nums text-green-700 mt-0.5">৳{formatBDT(monthly.paid)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setPayOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold shadow-sm"
          >
            <HandCoins className="w-4 h-4" /> Receive Payment
          </button>
          <button
            onClick={() => setDueOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold"
          >
            <MinusCircle className="w-4 h-4" /> Add Manual Due
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-page mt-4">
        <Tabs defaultValue="ledger" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-white p-1 rounded-xl h-10">
            <TabsTrigger value="ledger" className="rounded-lg text-xs font-semibold">Ledger</TabsTrigger>
            <TabsTrigger value="vault" className="rounded-lg text-xs font-semibold">Prescription Vault</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="mt-3">
            <LedgerTimeline entries={ledger} />
          </TabsContent>

          <TabsContent value="vault" className="mt-3 space-y-3">
            <button
              onClick={() => { setEditingPresc(null); setPrescOpen(true); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Prescription
            </button>
            {prescriptions.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <Pill className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No prescriptions saved</p>
                <p className="text-xs text-gray-400 mt-1">Save recurring meds for one-tap re-billing.</p>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 px-1 py-1 cursor-pointer select-none">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all prescriptions"
                  />
                  <span className="text-xs font-semibold text-gray-600">
                    {selectedPrescIds.size > 0 ? `${selectedPrescIds.size} selected` : "Select all"}
                  </span>
                </label>
                {prescriptions.map((p) => (
                  <PrescriptionCard
                    key={p.id}
                    prescription={p}
                    selected={selectedPrescIds.has(p.id)}
                    onToggleSelect={() => togglePresc(p.id)}
                    onEdit={() => { setEditingPresc(p); setPrescOpen(true); }}
                    onDelete={() => handleDeletePresc(p)}
                  />
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {selectedPrescIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 px-page pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={handleAddSelectedToSale}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-fluid-sm font-semibold shadow-lg"
            >
              <ShoppingCart className="w-4 h-4" />
              Add Selected ({selectedPrescIds.size}) to Sale
            </button>
          </div>
        </div>
      )}

      {profile?.pharmacy_id && (
        <>
          <QuickAddCustomerSheet
            open={editOpen}
            onOpenChange={setEditOpen}
            pharmacyId={profile.pharmacy_id}
            editing={customer}
            onSaved={() => load()}
          />
          {profile?.id && (
            <>
              <ReceivePaymentSheet
                open={payOpen}
                onOpenChange={setPayOpen}
                customerId={customer.id}
                customerName={customer.name}
                pharmacyId={profile.pharmacy_id}
                userId={profile.id}
                totalDue={due}
                onSaved={() => load()}
              />
              <AddManualDueSheet
                open={dueOpen}
                onOpenChange={setDueOpen}
                customerId={customer.id}
                customerName={customer.name}
                pharmacyId={profile.pharmacy_id}
                userId={profile.id}
                onSaved={() => load()}
              />
              <AddPrescriptionSheet
                open={prescOpen}
                onOpenChange={setPrescOpen}
                customerId={customer.id}
                pharmacyId={profile.pharmacy_id}
                editing={editingPresc}
                onSaved={() => load()}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CustomerProfile;