import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Plus, X, User as UserIcon } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import QuickAddCustomerSheet from "@/components/customers/QuickAddCustomerSheet";

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  total_due: number;
};

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const Customers = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    setLoading(true);
    let q = supabase
      .from("customers")
      .select("id, name, phone, total_due")
      .eq("pharmacy_id", profile.pharmacy_id)
      .order("name", { ascending: true })
      .limit(200);
    const term = query.trim();
    if (term) {
      q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    const { data } = await q;
    setRows((data || []) as CustomerRow[]);
    setLoading(false);
  }, [profile?.pharmacy_id, query]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md mx-auto pb-24">
      <AppHeader />

      <div className="flex items-center justify-between px-page pt-3 pb-2">
        <button onClick={() => navigate("/more")} className="flex items-center gap-2 text-gray-800">
          <ArrowLeft size={20} />
          <span className="font-semibold text-fluid-base">Customers</span>
        </button>
        <span className="text-fluid-xs text-gray-500">{rows.length} total</span>
      </div>

      <div className="px-page sticky top-0 z-10 bg-[#F4F6FB] pt-1 pb-2">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone"
            className="flex-1 text-sm outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery("")} className="p-1">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="px-page space-y-2 mt-2">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <UserIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No customers yet</p>
            <p className="text-xs text-gray-400 mt-1">Tap + to add your first customer.</p>
          </div>
        ) : (
          rows.map((c) => {
            const due = Number(c.total_due);
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/more/customers/${c.id}`)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-fluid-sm truncate">{c.name}</p>
                  <p className="text-fluid-xs text-gray-500 truncate">{c.phone || "—"}</p>
                </div>
                {due > 0 ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 whitespace-nowrap">
                    ৳{formatBDT(due)}
                  </span>
                ) : due < 0 ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 whitespace-nowrap">
                    +৳{formatBDT(-due)}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
                    Settled
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {profile?.pharmacy_id && (
        <>
          <button
            onClick={() => setAddOpen(true)}
            aria-label="Add customer"
            className="fixed bottom-6 right-1/2 translate-x-[calc(min(50vw,224px)-1.25rem)] h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg flex items-center justify-center text-white transition-colors z-40"
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
          <QuickAddCustomerSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            pharmacyId={profile.pharmacy_id}
            onSaved={(c) => {
              load();
              navigate(`/more/customers/${c.id}`);
            }}
          />
        </>
      )}
    </div>
  );
};

export default Customers;