import { useState, useEffect, useCallback, useMemo } from "react";
import { Sparkles, Pencil, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Pill, X, Plus, Minus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { totalPiecesToTriUnit, isSingleUnit } from "@/lib/stockUtils";
import { truncateName, truncateStrength, roundMoney, formatMoney } from "@/lib/formatUtils";
import { getDisplayFormat } from "@/lib/productType";
import CustomerPickerPopover, { type PickedCustomer } from "@/components/customers/CustomerPickerPopover";
import QuickAddCustomerSheet from "@/components/customers/QuickAddCustomerSheet";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
  price: number | null;
  stock_quantity: number | null;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
  product_type: string | null;
  unit_format: string | null;
  product_size: string | null;
}

interface CartItem {
  medicine: Medicine;
  quantity: number;
  discountPercent: number;
}

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
  const [discountPercent, setDiscountPercent] = useState(10);
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("10");
  const [defaultDiscount, setDefaultDiscount] = useState(10);

  // Customer & payment method
  const [selectedCustomer, setSelectedCustomer] = useState<PickedCustomer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "due" | "split">("cash");
  const [paidNow, setPaidNow] = useState<string>("");
  const [prescriptions, setPrescriptions] = useState<Array<{ id: string; medicine_id: string | null; medicine_name: string; dosage_frequency: string }>>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Fetch global default discount from pharmacy settings
  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    const fetchDefault = async () => {
      const { data } = await supabase
        .from("pharmacies")
        .select("default_discount")
        .eq("id", profile.pharmacy_id!)
        .single();
      if (data) {
        const val = (data as any).default_discount ?? 10;
        setDiscountPercent(val);
        setDiscountInput(String(val));
        setDefaultDiscount(val);
      }
    };
    fetchDefault();
  }, [profile?.pharmacy_id]);

  // Load draft sale if URL has ?draft=SALE_ID
  useEffect(() => {
    const draftParam = searchParams.get("draft");
    if (!draftParam || !profile?.pharmacy_id) return;

    const loadDraft = async () => {
      setLoadingDraft(true);
      try {
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

        const { data: items } = await supabase
          .from("sale_items")
          .select("medicine_id, medicine_name, company_name, quantity, unit_price, discount_percent")
          .eq("sale_id", sale.id);

        if (!items || items.length === 0) {
          setLoadingDraft(false);
          return;
        }

        const medIds = items.map((it) => it.medicine_id);
        const { data: medicines } = await supabase
          .from("medicines")
          .select("id, name, company_name, price, stock_quantity, pcs_per_strip, strip_per_pack, product_type, unit_format, product_size")
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
              unit_format: null,
              product_size: null,
            },
            quantity: it.quantity,
            discountPercent: (it as any).discount_percent ?? 0,
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

  // Pre-select customer from URL, load prescriptions, optionally auto-add one
  useEffect(() => {
    const customerId = searchParams.get("customer");
    const prescribeId = searchParams.get("prescribe");
    if (!customerId || !profile?.pharmacy_id) return;
    let cancelled = false;
    (async () => {
      const { data: cust } = await supabase
        .from("customers")
        .select("id, name, phone, total_due")
        .eq("id", customerId)
        .maybeSingle();
      if (cancelled || !cust) return;
      setSelectedCustomer(cust as PickedCustomer);

      const { data: presc } = await supabase
        .from("customer_prescriptions")
        .select("id, medicine_id, medicine_name, dosage_frequency")
        .eq("customer_id", customerId);
      if (cancelled) return;
      setPrescriptions(presc || []);

      if (prescribeId) {
        const ids = prescribeId.split(",").map((s) => s.trim()).filter(Boolean);
        for (const pid of ids) {
          const target = (presc || []).find((p) => p.id === pid);
          if (target) await addPrescriptionToCart(target);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, profile?.pharmacy_id]);

  // Load prescriptions whenever customer changes via picker
  useEffect(() => {
    if (!selectedCustomer) {
      setPrescriptions([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("customer_prescriptions")
        .select("id, medicine_id, medicine_name, dosage_frequency")
        .eq("customer_id", selectedCustomer.id);
      setPrescriptions(data || []);
    })();
  }, [selectedCustomer]);

  const addPrescriptionToCart = useCallback(async (presc: { medicine_id: string | null; medicine_name: string }) => {
    if (!profile?.pharmacy_id) return;
    let med: Medicine | null = null;
    if (presc.medicine_id) {
      const { data } = await supabase
        .from("medicines")
        .select("id, name, company_name, price, stock_quantity, pcs_per_strip, strip_per_pack, product_type, unit_format, product_size")
        .eq("id", presc.medicine_id)
        .maybeSingle();
      med = (data as Medicine | null) ?? null;
    }
    if (!med) {
      const { data } = await supabase
        .from("medicines")
        .select("id, name, company_name, price, stock_quantity, pcs_per_strip, strip_per_pack, product_type, unit_format, product_size")
        .eq("pharmacy_id", profile.pharmacy_id)
        .ilike("name", presc.medicine_name)
        .limit(1)
        .maybeSingle();
      med = (data as Medicine | null) ?? null;
    }
    if (!med) {
      toast.error(`"${presc.medicine_name}" not in inventory`);
      return;
    }
    setCartItems((prev) => {
      if (prev.find((c) => c.medicine.id === med!.id)) return prev;
      return [{ medicine: med!, quantity: 1, discountPercent: saleType === "wholesale" ? defaultDiscount : 0 }, ...prev];
    });
    setExpandedId(med.id);
  }, [profile?.pharmacy_id, saleType, defaultDiscount]);

  useEffect(() => {
    if (!searchQuery.trim() || !profile?.pharmacy_id) {
      setSearchResults([]);
      return;
    }
    setExpandedId(null);
    const timeout = setTimeout(async () => {
      setSearching(true);
      const q = searchQuery.trim();
      const { data, error } = await supabase.rpc("search_medicines", {
        _pharmacy_id: profile.pharmacy_id!,
        _query: q,
      });
      if (error) {
        setSearchResults([]);
      } else {
        setSearchResults(((data ?? []) as Medicine[]).slice(0, 10));
      }
      setSearching(false);
    }, 150);
    return () => clearTimeout(timeout);
  }, [searchQuery, profile?.pharmacy_id]);

  const addToCart = useCallback((medicine: Medicine) => {
    setCartItems((prev) => {
      const existing = prev.find((c) => c.medicine.id === medicine.id);
      if (existing) return prev;
      return [{ medicine, quantity: 1, discountPercent: saleType === "wholesale" ? defaultDiscount : 0 }, ...prev];
    });
    setExpandedId(medicine.id);
    setSearchQuery("");
    setSearchResults([]);
  }, [saleType, defaultDiscount]);

  const removeFromCart = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((c) => c.medicine.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, qty: number) => {
    if (qty < 1) return;
    setCartItems((prev) =>
      prev.map((c) => (c.medicine.id === id ? { ...c, quantity: qty } : c))
    );
  }, []);

  const updateItemDiscount = useCallback((id: string, percent: number) => {
    const clamped = Math.min(100, Math.max(0, percent));
    setCartItems((prev) =>
      prev.map((c) => (c.medicine.id === id ? { ...c, discountPercent: clamped } : c))
    );
  }, []);

  // When switching modes, reset item discounts
  const handleSaleTypeChange = useCallback((type: "retail" | "wholesale") => {
    setSaleType(type);
    setShowDropdown(false);
    setCartItems((prev) =>
      prev.map((c) => ({ ...c, discountPercent: type === "wholesale" ? defaultDiscount : 0 }))
    );
  }, [defaultDiscount]);

  // Calculate line total for an item (after item-wise discount in wholesale)
  const getLineTotal = useCallback((item: CartItem) => {
    const gross = item.quantity * (item.medicine.price || 0);
    if (saleType === "wholesale") {
      return roundMoney(gross * (1 - item.discountPercent / 100));
    }
    return roundMoney(gross);
  }, [saleType]);

  const subtotal = useMemo(
    () => roundMoney(cartItems.reduce((sum, c) => sum + c.quantity * (c.medicine.price || 0), 0)),
    [cartItems]
  );

  // For wholesale: net total = sum of per-item net amounts (no global discount)
  // For retail: net total = subtotal - global discount
  const wholesaleNetTotal = useMemo(
    () => roundMoney(cartItems.reduce((sum, c) => sum + getLineTotal(c), 0)),
    [cartItems, getLineTotal]
  );

  const discountAmount = useMemo(() => roundMoney(subtotal * discountPercent / 100), [subtotal, discountPercent]);
  const retailNetTotal = useMemo(() => roundMoney(subtotal - discountAmount), [subtotal, discountAmount]);

  const netTotal = saleType === "wholesale" ? wholesaleNetTotal : retailNetTotal;
  const totalDiscountAmount = saleType === "wholesale" ? roundMoney(subtotal - wholesaleNetTotal) : discountAmount;

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

      const salePayload = {
        sale_type: saleType,
        subtotal: roundMoney(subtotal),
        discount_percent: saleType === "wholesale" ? 0 : discountPercent,
        discount_amount: roundMoney(totalDiscountAmount),
        total: roundMoney(netTotal),
        status,
      };

      if (draftId) {
        const { error: updateError } = await supabase
          .from("sales")
          .update(salePayload)
          .eq("id", draftId);
        if (updateError) throw updateError;
        saleId = draftId;
        await supabase.from("sale_items").delete().eq("sale_id", draftId);
      } else {
        const { data: sale, error: saleError } = await supabase
          .from("sales")
          .insert({
            pharmacy_id: profile.pharmacy_id,
            user_id: profile.id,
            ...salePayload,
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
        unit_price: roundMoney(c.medicine.price || 0),
        total_price: roundMoney(getLineTotal(c)),
        discount_percent: saleType === "wholesale" ? c.discountPercent : 0,
      }));

      const { error: itemsError } = await supabase.from("sale_items").insert(items);
      if (itemsError) throw itemsError;

      if (status === "completed") {
        for (const c of cartItems) {
          const newStock = Math.max(0, (c.medicine.stock_quantity || 0) - c.quantity);
          await supabase
            .from("medicines")
            .update({ stock_quantity: newStock })
            .eq("id", c.medicine.id);
        }

        // Customer ledger posting (due/split)
        if (selectedCustomer && (paymentMethod === "due" || paymentMethod === "split")) {
          const paid = paymentMethod === "split" ? roundMoney(Math.max(0, Math.min(netTotal, parseFloat(paidNow) || 0))) : 0;
          const dueAmt = roundMoney(Math.max(0, netTotal - paid));
          if (dueAmt > 0) {
            const { error: ledgerErr } = await supabase.from("customer_ledger").insert({
              customer_id: selectedCustomer.id,
              pharmacy_id: profile.pharmacy_id,
              user_id: profile.id,
              entry_type: "due",
              amount: dueAmt,
              description: `Sale #${saleId.slice(0, 8)}`,
              sale_id: saleId,
            });
            if (ledgerErr) throw ledgerErr;
          }
          if (paymentMethod === "split" && paid > 0) {
            await supabase.from("cash_transactions").insert({
              pharmacy_id: profile.pharmacy_id,
              user_id: profile.id,
              direction: "in",
              category: "sale_cash",
              party_name: selectedCustomer.name,
              amount: paid,
              sale_id: saleId,
            });
          }
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

  const isWholesale = saleType === "wholesale";

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
            className={`px-4 py-1.5 rounded-full border text-sm font-semibold transition shadow-sm ${
              isWholesale
                ? "border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            }`}
          >
            {isWholesale ? "Wholesale" : "Retail"}
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              {(["retail", "wholesale"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleSaleTypeChange(t)}
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
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-50">
                  <Pill className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                    <span className="truncate">{truncateName(med.name)}</span>
                    {med.product_size && <span className="text-[10px] font-normal flex-shrink-0 text-muted-foreground">{truncateStrength(med.product_size)}</span>}
                    {getDisplayFormat(med) && (
                      <span className="text-[10px] font-semibold text-orange-600 align-super flex-shrink-0">{getDisplayFormat(med)}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {med.company_name && <span className="text-[10px] text-secondary-foreground truncate max-w-[100px]">{med.company_name}</span>}
                    {med.company_name && <span className="text-[10px] text-gray-300">·</span>}
                    <span className="text-[10px] font-mono font-bold text-primary flex-shrink-0">STK: {isSingleUnit(med.product_type) ? `${med.stock_quantity ?? 0} Pcs` : totalPiecesToTriUnit(med.stock_quantity ?? 0, med.strip_per_pack, med.pcs_per_strip)}</span>
                  </div>
                </div>
                <p className="text-lime-900 text-sm font-bold">৳{formatMoney(med.price ?? 0)}</p>
              </button>
            ))}
          </div>
        )}
        {searching && (
          <p className="text-xs text-gray-400 mt-2 text-center">Searching...</p>
        )}

        {/* Customer picker */}
        {profile?.pharmacy_id && (
          <div className="mt-3">
            <CustomerPickerPopover
              pharmacyId={profile.pharmacy_id}
              selected={selectedCustomer}
              onSelect={setSelectedCustomer}
              onQuickAdd={() => setQuickAddOpen(true)}
            />
          </div>
        )}

        {/* Prescription suggestions strip */}
        {selectedCustomer && prescriptions.length > 0 && cartItems.length === 0 && !searchQuery && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Saved for {selectedCustomer.name}</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {prescriptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addPrescriptionToCart(p)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition"
                >
                  <Pill className="w-3 h-3" />
                  <span className="truncate max-w-[110px]">{p.medicine_name}</span>
                  <span className="font-mono text-[10px] text-blue-500">{p.dosage_frequency}</span>
                </button>
              ))}
            </div>
          </div>
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
              const grossTotal = item.quantity * unitPrice;
              const lineTotal = getLineTotal(item);
              const isExpanded = expandedId === item.medicine.id;

              if (isExpanded) {
                return (
                  <div key={item.medicine.id} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4">
                    {/* Row 1: Name + type | MRP | Company */}
                    <div className="flex items-center gap-2 flex-nowrap">
                      <p className="text-sm font-bold text-gray-900 min-w-0 truncate flex items-center gap-1">
                        <span className="truncate">{truncateName(item.medicine.name)}</span>
                        {item.medicine.product_size && <span className="text-[10px] text-gray-400 font-normal flex-shrink-0">{truncateStrength(item.medicine.product_size)}</span>}
                        {getDisplayFormat(item.medicine) && (
                          <span className="text-[10px] font-semibold text-red-500 align-super flex-shrink-0">{getDisplayFormat(item.medicine)}</span>
                        )}
                      </p>
                      <span className="flex-shrink-0 text-right text-secondary-foreground text-xs font-medium ml-auto">MRP:{formatMoney(unitPrice)}</span>
                      {item.medicine.company_name && (
                        <span className="text-[10px] text-emerald-600 flex-shrink-0 font-medium truncate max-w-[60px]">{item.medicine.company_name}</span>
                      )}
                    </div>

                    {/* Row 2: Trash | STK | Discount% (wholesale) | Qty controller */}
                    <div className="flex items-center gap-1.5 mt-2 flex-nowrap">
                      <div className="flex items-center gap-1 min-w-0 flex-shrink-0">
                        <button
                          onClick={() => removeFromCart(item.medicine.id)}
                          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 transition flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                        <span className="text-[10px] font-mono whitespace-nowrap text-secondary-foreground">stk {isSingleUnit(item.medicine.product_type) ? `${item.medicine.stock_quantity ?? 0}` : totalPiecesToTriUnit(item.medicine.stock_quantity ?? 0, item.medicine.strip_per_pack, item.medicine.pcs_per_strip)}</span>
                      </div>

                      {/* Wholesale: item discount input */}
                      {isWholesale && (
                        <div className="flex items-center border border-blue-300 rounded-lg overflow-hidden flex-shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.discountPercent}
                            onChange={(e) => updateItemDiscount(item.medicine.id, parseFloat(e.target.value) || 0)}
                            className="w-10 text-xs text-center font-bold text-blue-700 outline-none bg-blue-50 py-1.5 appearance-none"
                          />
                          <span className="px-1.5 text-xs font-bold text-blue-600 bg-blue-50 border-l border-blue-300">%</span>
                        </div>
                      )}

                      {/* Retail: show calculation */}
                      {!isWholesale && (
                        <span className="text-[10px] font-semibold text-emerald-700 whitespace-nowrap flex-shrink-0 ml-auto">
                          {item.quantity}*{formatMoney(unitPrice)}={formatMoney(grossTotal)}৳
                        </span>
                      )}

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
                          className="w-9 font-bold text-gray-900 outline-none bg-transparent border-x-2 border-gray-900 py-1 text-xs text-center"
                        />
                        <button
                          onClick={() => updateQuantity(item.medicine.id, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition"
                        >
                          <Plus className="w-3.5 h-3.5 text-gray-900" />
                        </button>
                      </div>
                    </div>

                    {/* Row 3: Wholesale calculation string */}
                    {isWholesale && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs font-mono text-gray-500 text-center">
                          {formatMoney(unitPrice)} × {item.quantity} = {formatMoney(grossTotal)} - {item.discountPercent}% = <span className="font-bold text-emerald-700">{formatMoney(lineTotal)} ৳</span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              }

              // Collapsed card
              return (
                <div
                  key={item.medicine.id}
                  onClick={() => setExpandedId(item.medicine.id)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-4 text-right text-slate-700">{idx + 1}.</span>
                    <p className="text-sm font-bold text-gray-900 flex-1 min-w-0 flex items-center gap-1">
                      <span className="truncate">{truncateName(item.medicine.name)}</span>
                      {item.medicine.product_size && <span className="text-[10px] font-normal flex-shrink-0 text-slate-800">{truncateStrength(item.medicine.product_size)}</span>}
                      {getDisplayFormat(item.medicine) && (
                        <span className="text-[10px] font-semibold text-red-500 align-super flex-shrink-0">{getDisplayFormat(item.medicine)}</span>
                      )}
                    </p>
                    {isWholesale ? (
                      <>
                        <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{item.quantity}*{formatMoney(unitPrice)}-{item.discountPercent}%</span>
                        <span className="text-xs font-bold text-blue-700">{formatMoney(lineTotal)} ৳</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] text-secondary">{item.quantity}×{formatMoney(unitPrice)}</span>
                        <span className="text-xs font-bold text-emerald-600">{formatMoney(grossTotal)} ৳</span>
                      </>
                    )}
                  </div>
                  {item.medicine.company_name && (
                    <p className="text-[10px] ml-6 mt-0.5 text-secondary-foreground">{item.medicine.company_name}</p>
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
              <span className="text-sm font-medium text-gray-500 text-right ml-2">Subtotal</span>
              <span className="text-sm font-bold text-gray-900">
                {cartItems.map((c, i) => (
                  <span key={c.medicine.id}>
                    {i > 0 && " + "}
                    {formatMoney(c.quantity * (c.medicine.price || 0))}
                  </span>
                ))}
                {" = "}{formatMoney(subtotal)} ৳
              </span>
            </div>

            {/* Retail: global discount editor */}
            {!isWholesale && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-500 ml-2 flex items-center gap-1.5">
                  Discount
                  {!editingDiscount ? (
                    <>
                      <span>({discountPercent}%)</span>
                      <button onClick={() => { setEditingDiscount(true); setDiscountInput(String(discountPercent)); }} className="text-gray-400 hover:text-gray-600 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        value={discountInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDiscountInput(val);
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0 && num <= 100) {
                            setDiscountPercent(num);
                          }
                        }}
                        className="w-12 text-xs text-center border border-gray-200 rounded-md px-1 py-0.5 outline-none focus:border-gray-400 bg-transparent"
                        autoFocus
                        min={0}
                        max={100}
                      />
                      <span className="text-xs">%</span>
                      <button onClick={() => {
                        const num = parseFloat(discountInput);
                        if (!isNaN(num) && num >= 0 && num <= 100) {
                          setDiscountPercent(num);
                        } else {
                          setDiscountPercent(10);
                          setDiscountInput("10");
                        }
                        setEditingDiscount(false);
                      }} className="text-emerald-600 hover:text-emerald-700 transition">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                </span>
                <span className="text-sm font-bold text-gray-900">-{formatMoney(discountAmount)} ৳</span>
              </div>
            )}

            {/* Wholesale: total discount display */}
            {isWholesale && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-500 ml-2">Item Discounts</span>
                <span className="text-sm font-bold text-gray-900">-{formatMoney(totalDiscountAmount)} ৳</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-base font-extrabold text-gray-900">Net Total</span>
              <span className={`text-xl font-extrabold ${isWholesale ? "text-blue-700" : "text-emerald-600"}`}>{formatMoney(netTotal)} ৳</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 px-4 py-3 z-50">
        {selectedCustomer && cartItems.length > 0 && (
          <div className="mb-2">
            <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
              {(["cash", "due", "split"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                    paymentMethod === m ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {paymentMethod === "split" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Paid now</span>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-semibold">৳</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={netTotal}
                    value={paidNow}
                    onChange={(e) => setPaidNow(e.target.value)}
                    placeholder="0"
                    className="w-full h-8 pl-6 pr-2 text-xs rounded-lg border border-gray-200 bg-white outline-none"
                  />
                </div>
                <span className="text-xs font-semibold text-red-600 whitespace-nowrap">
                  Due ৳{Math.max(0, netTotal - (parseFloat(paidNow) || 0))}
                </span>
              </div>
            )}
            {paymentMethod === "due" && (
              <p className="mt-1.5 text-[11px] text-red-600 font-semibold">
                ৳{netTotal} will be added to {selectedCustomer.name}'s ledger
              </p>
            )}
          </div>
        )}
        <div className="flex gap-3">
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

      {profile?.pharmacy_id && (
        <QuickAddCustomerSheet
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          pharmacyId={profile.pharmacy_id}
          onSaved={(c) => setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone, total_due: 0 })}
        />
      )}
    </div>
  );
};

export default CreateSale;
