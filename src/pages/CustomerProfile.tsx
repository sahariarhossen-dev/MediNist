import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Phone, HandCoins, Pill, Plus } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import QuickAddCustomerSheet, { type CustomerLite } from "@/components/customers/QuickAddCustomerSheet";
import ReceivePaymentSheet from "@/components/customers/ReceivePaymentSheet";
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
  const [prescOpen, setPrescOpen] = useState(false);
  const [editingPresc, setEditingPresc] = useState<Prescription | null>(null);

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

  const totals = ledger.reduce(
    (acc, e) => {
      if (e.entry_type === "due") acc.due += Number(e.amount);
      else acc.payment += Number(e.amount);
      return acc;
    },
    { due: 0, payment: 0 },
  );

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
        <button onClick={() => navigate("/more/customers")} className="flex items-center gap-2 text-gray-800">
          <ArrowLeft size={20} />
          <span className="font-semibold text-fluid-base truncate max-w-[200px]">{customer.name}</span>
        </button>
        <button onClick={() => setEditOpen(true)} className="p-2 rounded-lg hover:bg-white">
          <Pencil size={16} className="text-gray-500" />
        </button>
      </div>

      {customer.phone && (
        <div className="px-page">
          <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 text-fluid-xs text-gray-500">
            <Phone className="w-3.5 h-3.5" /> {customer.phone}
          </a>
        </div>
      )}

      {/* Balance Card */}
      <div className="mx-page mt-3 bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-fluid-xs text-gray-500">{dueLabel}</p>
            <p className={`text-fluid-xl font-extrabold tabular-nums ${dueColor}`}>৳{formatBDT(Math.abs(due))}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-red-600 font-semibold">Sales ৳{formatBDT(totals.due)}</span>
              <span className="text-[11px] text-green-600 font-semibold">Paid ৳{formatBDT(totals.payment)}</span>
            </div>
          </div>
          <button
            onClick={() => setPayOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold whitespace-nowrap shadow-sm"
          >
            <HandCoins className="w-4 h-4" /> Receive Payment
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
              prescriptions.map((p) => (
                <PrescriptionCard
                  key={p.id}
                  prescription={p}
                  onAddToSale={() => navigate(`/create-sale?customer=${customer.id}&prescribe=${p.id}`)}
                  onEdit={() => { setEditingPresc(p); setPrescOpen(true); }}
                  onDelete={() => handleDeletePresc(p)}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

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