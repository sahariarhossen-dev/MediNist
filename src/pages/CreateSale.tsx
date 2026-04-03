import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Pill, X, Plus, Minus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  pcs_per_strip: number | null;
  product_type: string | null;
}

interface CartItem {
  medicine: Medicine;
  quantity: number;
}

const DISCOUNT_PERCENT = 10;

const CreateSale = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim() || !profile?.pharmacy_id) {
      setSearchResults([]);
      return;
    }
    setExpandedId(null);
    const timeout = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("medicines")
        .select("id, name, company_name, price, stock_quantity, pcs_per_strip, product_type")
        .eq("pharmacy_id", profile.pharmacy_id!)
        .ilike("name", `%${searchQuery}%`)
        .limit(10);
      setSearchResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, profile?.pharmacy_id]);

  const addToCart = useCallback((medicine: Medicine) => {
    setCartItems((prev) => {
      const existing = prev.find((c) => c.medicine.id === medicine.id);
      if (existing) return prev;
      return [{ medicine, quantity: 1 }, ...prev];
    });
    setExpandedId(medicine.id);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((c) => c.medicine.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, qty: number) => {
    if (qty < 1) return;
    setCartItems((prev) =>
      prev.map((c) => (c.medicine.id === id ? { ...c, quantity: qty } : c))
    );
  }, []);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, c) => sum + c.quantity * (c.medicine.price || 0), 0),
    [cartItems]
  );
  const discountAmount = useMemo(() => Math.round(subtotal * DISCOUNT_PERCENT / 100), [subtotal]);
  const netTotal = useMemo(() => subtotal - discountAmount, [subtotal, discountAmount]);

  const saveSale = async (status: "draft" | "completed") => {
    if (cartItems.length === 0) {
      toast.error("Add at least one item to the cart");
      return;
    }
    if (!profile?.pharmacy_id) {
      toast.error("No pharmacy linked to your account");
      return;
    }
    setSaving(true);
    try {
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          pharmacy_id: profile.pharmacy_id,
          user_id: profile.id,
          sale_type: saleType,
          subtotal,
          discount_percent: DISCOUNT_PERCENT,
          discount_amount: discountAmount,
          total: netTotal,
          status,
        })
        .select("id")
        .single();

      if (saleError) throw saleError;

      const items = cartItems.map((c) => ({
        sale_id: sale.id,
        medicine_id: c.medicine.id,
        medicine_name: c.medicine.name,
        company_name: c.medicine.company_name,
        quantity: c.quantity,
        unit_price: c.medicine.price || 0,
        total_price: c.quantity * (c.medicine.price || 0),
      }));

      const { error: itemsError } = await supabase.from("sale_items").insert(items);
      if (itemsError) throw itemsError;

      toast.success(status === "draft" ? "Sale saved as draft" : "Sale completed!");
      navigate("/sales");
    } catch (err: any) {
      toast.error(err.message || "Failed to save sale");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sales")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="15" cy="4" r="2" />
                <path d="M9 21l3-9 4 1" />
                <path d="M12 12l-4-3-3 9" />
                <path d="M6 6l6 3" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-gray-900 leading-tight">{profile?.full_name || "Staff"}</p>
              <p className="text-[11px] text-gray-400 leading-tight">By {pharmacyName || "Pharmacy"}</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="px-4 py-1.5 rounded-full border border-emerald-200 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition shadow-sm"
          >
            {saleType === "retail" ? "Retail" : "Wholesale"}
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              {(["retail", "wholesale"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setSaleType(t); setShowDropdown(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm font-medium transition ${saleType === t ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {t === "retail" ? "Retail" : "Wholesale"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2 bg-white">
        <div className="relative flex items-center border-2 border-gray-800 rounded-xl overflow-hidden">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search medicine..."
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              className="px-2 py-1"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-gray-700 transition" />
            </button>
          )}
          <div className="px-3 border-l-2 border-gray-800 py-2.5">
            <Search className="w-5 h-5 text-gray-700" />
          </div>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-xl shadow-lg bg-white overflow-hidden">
            {searchResults.map((med) => (
              <button
                key={med.id}
                onClick={() => addToCart(med)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition border-b border-gray-100 last:border-0"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Pill className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    {med.name}
                    {med.product_type && (
                      <span className="ml-1.5 text-[10px] font-semibold text-orange-600 align-super">{med.product_type}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {med.company_name && <span className="text-[10px] text-gray-400">{med.company_name}</span>}
                    {med.company_name && <span className="text-[10px] text-gray-300">·</span>}
                    <span className="text-[10px] text-gray-400">STK: {med.stock_quantity ?? 0}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-emerald-600">৳{med.price ?? 0}</p>
              </button>
            ))}
          </div>
        )}
        {searching && (
          <p className="text-xs text-gray-400 mt-2 text-center">Searching...</p>
        )}
      </div>

      {/* Cart */}
      <div className="flex-1 px-4 overflow-y-auto pb-44 pt-3">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Pill className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">No items added yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cartItems.map((item, idx) => {
              const unitPrice = item.medicine.price || 0;
              const lineTotal = item.quantity * unitPrice;
              const isExpanded = expandedId === item.medicine.id;

              if (isExpanded) {
                return (
                  <div key={item.medicine.id} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-3">
                    {/* Row 1: Icon + Name + Type + Company */}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Pill className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-sm font-bold text-gray-900 flex-1 min-w-0">
                        {item.medicine.name}
                        {item.medicine.product_type && (
                          <span className="ml-1 text-[10px] font-semibold text-orange-600 align-super">{item.medicine.product_type}</span>
                        )}
                      </p>
                      {item.medicine.company_name && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{item.medicine.company_name}</span>
                      )}
                    </div>
                    {/* Row 2: Trash + STK + MRP + Calc + Qty selector */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => removeFromCart(item.medicine.id)}
                        className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-emerald-600" />
                      </button>
                      <span className="text-[10px] text-gray-400">STK {item.medicine.stock_quantity ?? 0}</span>
                      <span className="text-[10px] text-gray-400">MRP {unitPrice}</span>
                      <span className="text-xs font-bold text-emerald-600 bg-yellow-100 px-1.5 py-0.5 rounded">
                        {item.quantity}×{unitPrice}={lineTotal}৳
                      </span>
                      <div className="ml-auto flex items-center rounded-full border border-emerald-200 bg-white overflow-hidden flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-emerald-50 transition"
                        >
                          <Minus className="w-3 h-3 text-emerald-600" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.medicine.id, parseInt(e.target.value) || 1)}
                          className="w-8 text-center text-xs font-bold text-gray-900 outline-none bg-transparent border-x border-emerald-100 py-1"
                        />
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-emerald-50 transition"
                        >
                          <Plus className="w-3 h-3 text-emerald-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Collapsed view
              return (
                <div
                  key={item.medicine.id}
                  onClick={() => setExpandedId(item.medicine.id)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-4 text-right">{idx + 1}.</span>
                    <p className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">
                      {item.medicine.name}
                      {item.medicine.product_type && (
                        <span className="ml-1 text-[10px] font-semibold text-orange-600 align-super">{item.medicine.product_type}</span>
                      )}
                    </p>
                    <span className="text-[10px] text-gray-400">{item.quantity}×{unitPrice}</span>
                    <span className="text-xs font-bold text-emerald-600">{lineTotal} ৳</span>
                  </div>
                  {item.medicine.company_name && (
                    <p className="text-[10px] text-gray-400 ml-6 mt-0.5">{item.medicine.company_name}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {cartItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mt-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-500">Subtotal</span>
              <span className="text-sm font-bold text-gray-900">{subtotal} ৳</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-500">Discount ({DISCOUNT_PERCENT}%)</span>
              <span className="text-sm font-bold text-gray-900">-{discountAmount} ৳</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-base font-extrabold text-gray-900">Net Total</span>
              <span className="text-xl font-extrabold text-emerald-700">{netTotal} ৳</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 px-4 py-3 flex gap-3 z-50">
        <button
          onClick={() => saveSale("draft")}
          disabled={saving || cartItems.length === 0}
          className="flex-1 py-3.5 rounded-xl border-2 border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Draft
        </button>
        <button
          onClick={() => saveSale("completed")}
          disabled={saving || cartItems.length === 0}
          className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          {saving ? "Saving..." : "Complete Sale"}
        </button>
      </div>
    </div>
  );
};

export default CreateSale;
