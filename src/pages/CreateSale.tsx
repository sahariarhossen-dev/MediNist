import { useState, useEffect, useCallback, useMemo } from "react";
import { Sparkles, Pencil, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Pill, X, Plus, Minus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { totalPiecesToTriUnit } from "@/lib/stockUtils";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
  product_type: string | null;
}

interface CartItem {
  medicine: Medicine;
  quantity: number;
}

const DEFAULT_DISCOUNT_PERCENT = 10;

const CreateSale = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, pharmacyName } = useAuth();
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(DEFAULT_DISCOUNT_PERCENT);
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState(String(DEFAULT_DISCOUNT_PERCENT));

  // Load draft sale if URL has ?draft=SALE_ID
  useEffect(() => {
    const draftParam = searchParams.get("draft");
    if (!draftParam || !profile?.pharmacy_id) return;

    const loadDraft = async () => {
      setLoadingDraft(true);
      try {
        // Fetch sale
        const { data: sale } = await supabase
          .from("sales")
          .select("id, sale_type, status")
          .eq("id", draftParam)
          .single();

        if (!sale || sale.status !== "draft") {
          toast.error("Draft not found or already completed");
          setLoadingDraft(false);
          return;
        }

        setDraftId(sale.id);
        setSaleType(sale.sale_type as "retail" | "wholesale");

        // Fetch sale items
        const { data: items } = await supabase
          .from("sale_items")
          .select("medicine_id, medicine_name, company_name, quantity, unit_price")
          .eq("sale_id", sale.id);

        if (!items || items.length === 0) {
          setLoadingDraft(false);
          return;
        }

        // Fetch current medicine data for each item
        const medIds = items.map((it) => it.medicine_id);
        const { data: medicines } = await supabase
          .from("medicines")
          .select("id, name, company_name, price, stock_quantity, pcs_per_strip, strip_per_pack, product_type")
          .in("id", medIds);

        const medMap = new Map((medicines || []).map((m) => [m.id, m]));

        const loaded: CartItem[] = items.map((it) => {
          const med = medMap.get(it.medicine_id);
          return {
            medicine: med || {
              id: it.medicine_id,
              name: it.medicine_name,
              company_name: it.company_name,
              price: it.unit_price,
              stock_quantity: null,
              pcs_per_strip: null,
              strip_per_pack: null,
              product_type: null,
            },
            quantity: it.quantity,
          };
        });

        setCartItems(loaded);
        if (loaded.length > 0) setExpandedId(loaded[0].medicine.id);
      } catch {
        toast.error("Failed to load draft");
      } finally {
        setLoadingDraft(false);
      }
    };
    loadDraft();
  }, [searchParams, profile?.pharmacy_id]);

  useEffect(() => {
    if (!searchQuery.trim() || !profile?.pharmacy_id) {
      setSearchResults([]);
      return;
    }
    setExpandedId(null);
    const timeout = setTimeout(async () => {
      setSearching(true);
      const q = searchQuery.trim();
      const baseQuery = supabase
        .from("medicines")
        .select("id, name, company_name, price, stock_quantity, pcs_per_strip, strip_per_pack, product_type")
        .eq("pharmacy_id", profile.pharmacy_id!);

      const [startsRes, containsRes] = await Promise.all([
        baseQuery.ilike("name", `${q}%`).limit(10),
        supabase
          .from("medicines")
          .select("id, name, company_name, price, stock_quantity, pcs_per_strip, strip_per_pack, product_type")
          .eq("pharmacy_id", profile.pharmacy_id!)
          .ilike("name", `%${q}%`)
          .limit(10),
      ]);

      const startsWith = startsRes.data || [];
      const startIds = new Set(startsWith.map((m) => m.id));
      const contains = (containsRes.data || []).filter((m) => !startIds.has(m.id));
      setSearchResults([...startsWith, ...contains].slice(0, 10));
      setSearching(false);
    }, 150);
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
  const discountAmount = useMemo(() => Math.round(subtotal * discountPercent / 100), [subtotal, discountPercent]);
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
      let saleId: string;

      if (draftId) {
        // Update existing draft
        const { error: updateError } = await supabase
          .from("sales")
          .update({
            sale_type: saleType,
            subtotal,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            total: netTotal,
            status,
          })
          .eq("id", draftId);

        if (updateError) throw updateError;
        saleId = draftId;

        // Delete old sale_items and re-insert
        await supabase.from("sale_items").delete().eq("sale_id", draftId);
      } else {
        // Insert new sale
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
        saleId = sale.id;
      }

      const items = cartItems.map((c) => ({
        sale_id: saleId,
        medicine_id: c.medicine.id,
        medicine_name: c.medicine.name,
        company_name: c.medicine.company_name,
        quantity: c.quantity,
        unit_price: c.medicine.price || 0,
        total_price: c.quantity * (c.medicine.price || 0),
      }));

      const { error: itemsError } = await supabase.from("sale_items").insert(items);
      if (itemsError) throw itemsError;

      // Deduct stock for each sold item only on complete
      if (status === "completed") {
        for (const c of cartItems) {
          const newStock = Math.max(0, (c.medicine.stock_quantity || 0) - c.quantity);
          await supabase
            .from("medicines")
            .update({ stock_quantity: newStock })
            .eq("id", c.medicine.id);
        }
      }

      toast.success(status === "draft" ? "Sale saved as draft" : "Sale completed!");
      setCartItems([]);
      setSearchQuery("");
      setSearchResults([]);
      setExpandedId(null);
      setDraftId(null);
      navigate("/sales");
    } catch (err: any) {
      toast.error(err.message || "Failed to save sale");
    } finally {
      setSaving(false);
    }
  };

  if (loadingDraft) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading draft…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sales")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2.5 text-secondary">
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
              <p className="text-[11px] leading-tight text-muted">By {pharmacyName || "Pharmacy"}</p>
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
          {!searchQuery && (
            <div className="px-3 border-l-2 border-gray-800 py-2.5">
              <Search className="w-5 h-5 text-gray-700" />
            </div>
          )}
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
                    {med.company_name && <span className="text-[10px] text-secondary-foreground">{med.company_name}</span>}
                    {med.company_name && <span className="text-[10px] text-gray-300">·</span>}
                    <span className="text-[10px] font-mono font-bold text-primary">STK: {totalPiecesToTriUnit(med.stock_quantity ?? 0, med.strip_per_pack, med.pcs_per_strip)}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-lime-900">৳{med.price ?? 0}</p>
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
                  <div key={item.medicine.id} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4">
                    {/* Line 1: Name + type | MRP | Company */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-bold text-gray-900 min-w-0 flex-1">
                        {item.medicine.name}
                        {item.medicine.product_type && (
                          <span className="ml-1 text-[11px] font-semibold text-red-500 align-super">{item.medicine.product_type}</span>
                        )}
                      </p>
                      <span className="flex-shrink-0 text-right mx-[25px] text-secondary-foreground text-xs font-medium">MRP : {unitPrice}</span>
                      {item.medicine.company_name && (
                        <span className="text-[11px] text-emerald-600 flex-shrink-0 font-medium mx-[10px]">{item.medicine.company_name}</span>
                      )}
                    </div>
                    {/* Line 2: Trash+STK | Calculation | Qty controller */}
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <button
                          onClick={() => removeFromCart(item.medicine.id)}
                          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 transition flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                        <span className="text-[11px] font-mono whitespace-nowrap text-secondary-foreground">stk {totalPiecesToTriUnit(item.medicine.stock_quantity ?? 0, item.medicine.strip_per_pack, item.medicine.pcs_per_strip)}</span>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap mx-[10px]">
                        {item.quantity}*{unitPrice}={lineTotal}৳
                      </span>
                      <div className="flex items-center border-gray-900 rounded-xl overflow-hidden flex-shrink-0 border-solid border">
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition"
                        >
                          <Minus className="w-3.5 h-3.5 text-gray-900" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.medicine.id, parseInt(e.target.value) || 1)}
                          className="w-9 font-bold text-gray-900 outline-none bg-transparent border-x-2 border-gray-900 py-1 text-xs text-right"
                        />
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition"
                        >
                          <Plus className="w-3.5 h-3.5 text-gray-900" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

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
                        <span className="ml-1 text-[10px] font-semibold text-red-500 align-super">{item.medicine.product_type}</span>
                      )}
                    </p>
                    <span className="text-[10px] text-secondary">{item.quantity}×{unitPrice}</span>
                    <span className="text-xs font-bold text-emerald-600">{lineTotal} ৳</span>
                  </div>
                  {item.medicine.company_name && (
                    <p className="text-[10px] text-secondary ml-6 mt-0.5">{item.medicine.company_name}</p>
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
              <span className="text-sm font-medium text-gray-500 text-right mx-[35px]">Subtotal</span>
              <span className="text-sm font-bold text-gray-900">
                {cartItems.map((c, i) => (
                  <span key={c.medicine.id}>
                    {i > 0 && " + "}
                    {c.quantity * (c.medicine.price || 0)}
                  </span>
                ))}
                {" = "}{subtotal} ৳
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-500 mx-[35px]">Discount ({DISCOUNT_PERCENT}%)</span>
              <span className="text-sm font-bold text-gray-900">-{discountAmount} ৳</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-base font-extrabold text-gray-900">Net Total</span>
              <span className="text-xl font-extrabold text-emerald-600">{netTotal} ৳</span>
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
          {saving ? "Saving..." : <><Sparkles className="w-4 h-4 inline mr-1" />Complete Sale</>}
        </button>
      </div>
    </div>
  );
};

export default CreateSale;
